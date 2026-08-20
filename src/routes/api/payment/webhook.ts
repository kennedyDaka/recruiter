/**
 * PayChangu Webhook Handler
 *
 * Receives POST notifications from PayChangu when payment status changes.
 * Verifies transaction server-side before activating campaigns.
 *
 * Expected payload from PayChangu:
 * {
 *   "event": "charge.success",
 *   "data": {
 *     "id": "...",
 *     "tx_ref": "...",
 *     "amount": 95000,
 *     "currency": "MWK",
 *     "status": "success",
 *     "charge_id": "...",
 *     "payment_method": "airtel_money"
 *   }
 * }
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

          // Verify HMAC signature. When a webhook secret is configured it is
          // mandatory — the comparison is constant-time to avoid timing oracles.
          // Outside test mode an unconfigured secret is a configuration error
          // and the webhook is refused rather than processed unverified.
          const webhookSecret = process.env["PAYCHANGU_WEBHOOK_SECRET"];
          const testMode = process.env["PAYCHANGU_TEST_MODE"] === "true";
          if (!webhookSecret && !testMode) {
            console.error("PAYCHANGU_WEBHOOK_SECRET is not configured");
            return json({ error: "Webhook not configured" }, { status: 503 });
          }
          if (webhookSecret) {
            const crypto = await import("crypto");
            // PayChangu signs with the hex-encoded SHA-256 HMAC of the raw
            // payload, sent in the "Signature"/"x-paychangu-signature" header.
            const expectedHex = crypto
              .createHmac("sha256", webhookSecret)
              .update(rawBody)
              .digest("hex");
            const provided = Buffer.from(signature, "utf8");
            const expected = Buffer.from(expectedHex, "utf8");
            const valid =
              provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
            if (!valid) {
              console.error("Webhook signature verification failed");
              return json({ error: "Invalid signature" }, { status: 401 });
            }
          }

          // Process the webhook through the PaymentService
          const { processPayChanguWebhook } = await import("@/lib/payment/payment.service");

          const result = (await processPayChanguWebhook({
            data: {
              payload,
              signature,
            },
          } as never)) as { processed: boolean; error?: string };

          if (!result?.processed) {
            console.error("Webhook processing failed:", result?.error);
            return json({ error: result?.error ?? "Processing failed" }, { status: 400 });
          }

          return json({ received: true });
        } catch (error) {
          console.error("Webhook error:", error);
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
