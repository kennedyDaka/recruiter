/**
 * PayChangu Webhook Handler
 *
 * Receives POST notifications from PayChangu when payment status changes.
 * Handles both checkout payments (charge.success) and
 * Direct Mobile Money charges (api.charge.payment).
 *
 * Verifies transaction server-side before activating campaigns.
 */

import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payment/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Read the raw body for signature verification
          const rawBody = await request.text();
          const signature = request.headers.get("x-paychangu-signature") ?? "";

          // Parse JSON payload
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(rawBody);
          } catch {
            return json({ error: "Invalid JSON" }, { status: 400 });
          }

          // Verify HMAC signature
          const webhookSecret = process.env["PAYCHANGU_WEBHOOK_SECRET"];
          const testMode = process.env["PAYCHANGU_TEST_MODE"] === "true";
          if (!webhookSecret && !testMode) {
            console.error("PAYCHANGU_WEBHOOK_SECRET is not configured");
            return json({ error: "Webhook not configured" }, { status: 503 });
          }
          if (webhookSecret) {
            const crypto = await import("crypto");
            const expectedHex = crypto
              .createHmac("sha256", webhookSecret)
              .update(rawBody)
              .digest("hex");
            const provided = Buffer.from(signature, "utf8");
            const expected = Buffer.from(expectedHex, "utf8");
            const valid =
              provided.length === expected.length &&
              crypto.timingSafeEqual(provided, expected);
            if (!valid) {
              console.error("Webhook signature verification failed");
              return json({ error: "Invalid signature" }, { status: 401 });
            }
          }

          // Determine event type — handle both checkout and direct charge formats
          const eventType =
            (payload["event_type"] as string) ?? (payload["event"] as string) ?? "unknown";

          // Only process successful payment events
          // checkout: "charge.success"
          // direct charge: "api.charge.payment"
          const isSuccess =
            eventType === "charge.success" || eventType === "api.charge.payment";

          if (!isSuccess) {
            // Log and ignore non-success events
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("webhook_logs").insert({
              provider: "paychangu",
              event_type: eventType,
              payload: JSON.stringify(payload),
              signature: signature || null,
              processed: true,
            });
            return json({ received: true });
          }

          // Process the webhook through the PaymentService
          const { processPayChanguWebhook } = await import(
            "@/lib/payment/payment.service"
          );

          const result = (await processPayChanguWebhook({
            data: {
              payload,
              signature,
            },
          } as never)) as { processed: boolean; error?: string };

          if (!result?.processed) {
            console.error("Webhook processing failed:", result?.error);
            try {
              const { reportIncident } = await import("@/lib/auto-incident");
              await reportIncident({
                title: `PayChangu webhook processing failed`,
                description: result?.error ?? "Unknown processing error",
                priority: "high",
                category: "billing",
                errorType: "WEBHOOK_PROCESSING_FAILED",
                errorMessage: result?.error,
                channel: "webhook",
              });
            } catch {}
            return json(
              { error: result?.error ?? "Processing failed" },
              { status: 400 },
            );
          }

          return json({ received: true });
        } catch (error: any) {
          console.error("Webhook error:", error);
          try {
            const { reportIncident } = await import("@/lib/auto-incident");
            await reportIncident({
              title: `PayChangu webhook error`,
              description: error?.message ?? String(error),
              priority: "critical",
              category: "billing",
              errorType: "WEBHOOK_ERROR",
              errorMessage: error?.message ?? String(error),
              channel: "webhook",
            });
          } catch {}
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
