import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DAILY_RATE, MIN_DAYS, MAX_DAYS, calculateCampaignPrice } from "@/lib/payment/pricing";

const initiatePaymentSchema = z.object({
  campaignId: z.string().min(1),
  numDays: z.number().int().min(MIN_DAYS).max(MAX_DAYS),
  phone: z.string().optional(),
  provider: z.enum(["airtel_money", "tnm_mpamba", "card"]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

export const Route = createFileRoute("/api/payment/initiate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
          const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");

          const session = await getSessionFromCookieServer();
          if (!session) {
            return json({ error: "Sign in required to start a payment." }, { status: 401 });
          }
          const tenantId = await resolveTenantIdForUser(session.userId);
          if (!tenantId) {
            return json({ error: "No tenant is bound to this account." }, { status: 403 });
          }

          const body = await request.json();
          const data = initiatePaymentSchema.parse(body);

          // Phone required for mobile money, not for card
          if (data.provider !== "card" && (!data.phone || data.phone.length < 10)) {
            return json({ error: "Phone number is required for mobile money payments." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Server-side price calculation — never trust frontend amount
          const amount = calculateCampaignPrice(data.numDays);

          // Campaign must exist and belong to this tenant
          const [campaignRes, defaultPlanRes] = await Promise.all([
            supabaseAdmin
              .from("campaigns")
              .select("id, tenant_id, name")
              .eq("id", data.campaignId)
              .maybeSingle(),
            supabaseAdmin
              .from("plans")
              .select("id")
              .eq("active", true)
              .order("sort_order")
              .limit(1)
              .maybeSingle(),
          ]);

          if (campaignRes.error || !campaignRes.data) {
            return json({ error: "Campaign not found." }, { status: 404 });
          }
          if (campaignRes.data.tenant_id !== tenantId) {
            return json({ error: "Campaign not found." }, { status: 404 });
          }

          const fallbackPlanId = defaultPlanRes.data?.id;
          if (!fallbackPlanId) {
            return json({ error: "No active plan configured" }, { status: 500 });
          }

          // Simpler check: find any paid invoice for this campaign
          const paidInvoiceRes = await supabaseAdmin
            .from("invoices")
            .select("id")
            .eq("campaign_id", data.campaignId)
            .eq("status", "paid")
            .limit(1)
            .maybeSingle();

          if (paidInvoiceRes.data) {
            return json(
              { error: "Campaign already activated. No further payment needed." },
              { status: 409 },
            );
          }

          // Create invoice
          const invoiceRes = await supabaseAdmin
            .from("invoices")
            .insert({
              tenant_id: tenantId,
              plan_id: fallbackPlanId,
              campaign_id: data.campaignId,
              invoice_number: `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              amount,
              currency: "MWK",
              status: "pending",
              due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              metadata: JSON.stringify({ num_days: data.numDays, daily_rate: DAILY_RATE }),
            })
            .select("id, invoice_number, amount, currency")
            .single();

          if (invoiceRes.error) {
            return json({ error: "Failed to create invoice" }, { status: 500 });
          }

          const invoice = invoiceRes.data;

          // Generate unique charge ID for this transaction
          const chargeId = `CHG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          const txRef = `TX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

          // Create payment record
          const paymentRes = await supabaseAdmin
            .from("payments")
            .insert({
              tenant_id: tenantId,
              invoice_id: invoice.id,
              provider: "paychangu",
              tx_ref: txRef,
              charge_id: chargeId,
              amount: invoice.amount,
              currency: invoice.currency,
              payment_method: data.provider,
              phone_number: data.phone ?? null,
              status: "pending",
              metadata: JSON.stringify({
                customer_email: data.customer.email,
                customer_name: data.customer.name,
                num_days: data.numDays,
              }),
            })
            .select("id, tx_ref, charge_id")
            .single();

          if (paymentRes.error) {
            return json({ error: "Failed to create payment" }, { status: 500 });
          }

          // Update invoice status
          await supabaseAdmin
            .from("invoices")
            .update({ status: "processing" })
            .eq("id", invoice.id);

          const nameParts = data.customer.name.trim().split(/\s+/);
          const firstName = nameParts[0] ?? data.customer.name;
          const lastName = nameParts.slice(1).join(" ") || firstName;

          // ── Card payment: create checkout session ──
          if (data.provider === "card") {
            const { createCheckoutSession } = await import(
              "@/lib/payment/providers/paychangu-checkout"
            );

            const callbackUrl = `${process.env.APP_URL ?? "https://recruitermw.com"}/api/payment/webhook`;

            const checkoutResult = await createCheckoutSession({
              amount: invoice.amount,
              currency: "MWK",
              txRef,
              email: data.customer.email,
              firstName,
              lastName,
              callbackUrl,
            });

            if (!checkoutResult.success) {
              await supabaseAdmin
                .from("payments")
                .update({ status: "failed", error_message: checkoutResult.error, failed_at: new Date().toISOString() })
                .eq("id", paymentRes.data.id);
              await supabaseAdmin
                .from("invoices")
                .update({ status: "failed" })
                .eq("id", invoice.id);
              return json({ error: checkoutResult.error ?? "Failed to create checkout session" }, { status: 500 });
            }

            await supabaseAdmin
              .from("payments")
              .update({ status: "processing", initiated_at: new Date().toISOString() })
              .eq("id", paymentRes.data.id);

            return json({
              success: true,
              paymentId: paymentRes.data.id,
              chargeId,
              txRef,
              checkoutUrl: checkoutResult.checkoutUrl,
              status: "processing",
            });
          }

          // ── Mobile Money: direct charge ──
          const { initiateMobileMoneyCharge } = await import(
            "@/lib/payment/providers/paychangu-mobile-money"
          );

          const chargeResult = await initiateMobileMoneyCharge({
            phone: data.phone!,
            amount: invoice.amount,
            chargeId,
            provider: data.provider as "airtel_money" | "tnm_mpamba",
            firstName,
            lastName,
            email: data.customer.email,
          });

          if (!chargeResult.success) {
            await supabaseAdmin
              .from("payments")
              .update({ status: "failed", error_message: chargeResult.error, failed_at: new Date().toISOString() })
              .eq("id", paymentRes.data.id);
            await supabaseAdmin
              .from("invoices")
              .update({ status: "failed" })
              .eq("id", invoice.id);
            return json({ error: chargeResult.error ?? "Failed to initiate payment" }, { status: 500 });
          }

          await supabaseAdmin
            .from("payments")
            .update({ status: "processing", provider_transaction_id: chargeResult.refId, initiated_at: new Date().toISOString() })
            .eq("id", paymentRes.data.id);

          return json({
            success: true,
            paymentId: paymentRes.data.id,
            chargeId,
            txRef,
            status: "processing",
          });
        } catch (error: any) {
          console.error("Payment initiation error:", error);
          try {
            const { reportIncident } = await import("@/lib/auto-incident");
            await reportIncident({
              title: `Payment initiation failed`,
              description: error?.message ?? String(error),
              priority: "high",
              category: "billing",
              errorType: "PAYMENT_INITIATION_FAILED",
              errorMessage: error?.message ?? String(error),
              channel: "payment",
            });
          } catch {}
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
