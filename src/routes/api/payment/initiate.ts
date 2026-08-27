import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const DAILY_RATE = 15_000;
const MIN_DAYS = 3;

const initiatePaymentSchema = z.object({
  campaignId: z.string().min(1),
  numDays: z.number().int().min(MIN_DAYS).max(365),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
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

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Campaign must exist and belong to this tenant
          const campaignRes = await supabaseAdmin
            .from("campaigns")
            .select("id, tenant_id, name")
            .eq("id", data.campaignId)
            .maybeSingle();
          if (campaignRes.error || !campaignRes.data) {
            return json({ error: "Campaign not found." }, { status: 404 });
          }
          if (campaignRes.data.tenant_id !== tenantId) {
            return json({ error: "Campaign not found." }, { status: 404 });
          }

          const amount = data.numDays * DAILY_RATE;

          // Get the first active plan as FK reference (plans table is legacy, kept for FK)
          const defaultPlanRes = await supabaseAdmin
            .from("plans")
            .select("id")
            .eq("active", true)
            .order("sort_order")
            .limit(1)
            .maybeSingle();
          const fallbackPlanId = defaultPlanRes.data?.id;
          if (!fallbackPlanId) {
            return json({ error: "No active plan configured" }, { status: 500 });
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

          // Generate transaction reference
          const txRef = `TX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

          // Create payment record (no payment_method — user selects on PayChangu)
          const paymentRes = await supabaseAdmin
            .from("payments")
            .insert({
              tenant_id: tenantId,
              invoice_id: invoice.id,
              provider: "paychangu",
              tx_ref: txRef,
              amount: invoice.amount,
              currency: invoice.currency,
              status: "pending",
              metadata: JSON.stringify({
                customer_email: data.customer.email,
                customer_name: data.customer.name,
                customer_phone: data.customer.phone,
              }),
            })
            .select("id, tx_ref")
            .single();

          if (paymentRes.error) {
            return json({ error: "Failed to create payment" }, { status: 500 });
          }

          // Update invoice status
          await supabaseAdmin
            .from("invoices")
            .update({ status: "processing" })
            .eq("id", invoice.id);

          // Call PayChangu API to create checkout session
          const nameParts = data.customer.name.trim().split(/\s+/);
          const firstName = nameParts[0] ?? data.customer.name;
          const lastName = nameParts.slice(1).join(" ") || firstName;

          const paychanguResponse = await fetch(
            `${process.env["PAYCHANGU_API_URL"] ?? "https://api.paychangu.com"}/payment`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env["PAYCHANGU_SECRET_KEY"]}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                amount: String(invoice.amount),
                currency: invoice.currency,
                tx_ref: txRef,
                first_name: firstName,
                last_name: lastName,
                email: data.customer.email,
                callback_url: `${process.env["APP_URL"]}/api/payment/webhook`,
                return_url: `${process.env["APP_URL"]}/payment/success?tx_ref=${txRef}&campaign_id=${data.campaignId}`,
                customization: {
                  title: "Operon Recruit",
                  description: `${data.numDays}-day campaign activation`,
                },
                meta: {
                  invoice_id: invoice.id,
                  campaign_id: data.campaignId,
                  campaign_name: campaignRes.data.name,
                  num_days: data.numDays,
                },
              }),
            },
          );

          const paychanguData = await paychanguResponse.json();

          if (!paychanguResponse.ok || !paychanguData.data?.checkout_url) {
            await supabaseAdmin
              .from("payments")
              .update({
                status: "failed",
                error_message: paychanguData.message ?? "Failed to create checkout",
                failed_at: new Date().toISOString(),
              })
              .eq("id", paymentRes.data.id);

            await supabaseAdmin
              .from("invoices")
              .update({ status: "failed" })
              .eq("id", invoice.id);

            return json({ error: "Failed to initiate payment" }, { status: 500 });
          }

          return json({
            success: true,
            paymentId: paymentRes.data.id,
            txRef,
            checkoutUrl: paychanguData.data.checkout_url,
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
