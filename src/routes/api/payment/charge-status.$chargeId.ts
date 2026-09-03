import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/payment/charge-status/:chargeId
 *
 * Polls the payment status by charge_id. Also verifies with PayChangu
 * server-side when the payment is still in processing state.
 */
export const Route = createFileRoute("/api/payment/charge-status/$chargeId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { chargeId } = params;
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          // Find payment by charge_id
          const { data: payment, error } = await supabaseAdmin
            .from("payments")
            .select("id, tx_ref, charge_id, status, amount, currency, payment_method, completed_at, invoice_id")
            .eq("charge_id", chargeId)
            .maybeSingle();

          if (error) throw error;
          if (!payment) {
            return json({ error: "Payment not found" }, { status: 404 });
          }

          // Look up campaign_id from the invoice
          let campaignId: string | null = null;
          let campaignStatus: string | null = null;
          let publicToken: string | null = null;

          if (payment.invoice_id) {
            const { data: invoice } = await supabaseAdmin
              .from("invoices")
              .select("campaign_id")
              .eq("id", payment.invoice_id)
              .maybeSingle();
            campaignId = invoice?.campaign_id ?? null;

            if (campaignId) {
              const { data: campaign } = await supabaseAdmin
                .from("campaigns")
                .select("status, public_token")
                .eq("id", campaignId)
                .maybeSingle();
              campaignStatus = campaign?.status ?? null;
              publicToken = campaign?.public_token ?? null;
            }
          }

          // If payment is still processing, verify with PayChangu
          if (payment.status === "processing" && payment.charge_id) {
            const { verifyMobileMoneyCharge } = await import(
              "@/lib/payment/providers/paychangu-mobile-money"
            );

            const verification = await verifyMobileMoneyCharge(payment.charge_id);

            if (verification.status === "success" && verification.amount === payment.amount) {
              // Payment confirmed — activate campaign
              await supabaseAdmin
                .from("payments")
                .update({
                  status: "success",
                  verified_at: new Date().toISOString(),
                  completed_at: new Date().toISOString(),
                })
                .eq("id", payment.id);

              await supabaseAdmin
                .from("invoices")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .eq("id", payment.invoice_id);

              // Activate campaign if pending
              if (campaignId && campaignStatus === "pending_payment") {
                const invoiceRes = await supabaseAdmin
                  .from("invoices")
                  .select("metadata")
                  .eq("id", payment.invoice_id)
                  .maybeSingle();

                const meta = invoiceRes.data?.metadata
                  ? JSON.parse(invoiceRes.data.metadata as string)
                  : {};
                const numDays: number = meta.num_days ?? 30;

                const publicTokenNew = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
                const closingDate = new Date();
                closingDate.setDate(closingDate.getDate() + numDays);

                await supabaseAdmin
                  .from("campaigns")
                  .update({
                    status: "active",
                    published_at: new Date().toISOString(),
                    public_token: publicTokenNew,
                    closing_date: closingDate.toISOString(),
                  })
                  .eq("id", campaignId);

                // Create subscription
                await supabaseAdmin.from("subscriptions").insert({
                  tenant_id: payment.invoice_id ? (await supabaseAdmin.from("invoices").select("tenant_id, plan_id").eq("id", payment.invoice_id).maybeSingle()).data?.tenant_id : null,
                  plan_id: payment.invoice_id ? (await supabaseAdmin.from("invoices").select("plan_id").eq("id", payment.invoice_id).maybeSingle()).data?.plan_id : null,
                  invoice_id: payment.invoice_id,
                  campaign_id: campaignId,
                  start_date: new Date().toISOString(),
                  end_date: closingDate.toISOString(),
                  status: "active",
                });

                campaignStatus = "active";
                publicToken = publicTokenNew;
              } else if (campaignId && campaignStatus === "active") {
                // Extension
                const invoiceRes = await supabaseAdmin
                  .from("invoices")
                  .select("metadata")
                  .eq("id", payment.invoice_id)
                  .maybeSingle();

                const meta = invoiceRes.data?.metadata
                  ? JSON.parse(invoiceRes.data.metadata as string)
                  : {};
                const numDays: number = meta.num_days ?? 30;

                const { data: campaign } = await supabaseAdmin
                  .from("campaigns")
                  .select("closing_date")
                  .eq("id", campaignId)
                  .maybeSingle();

                const currentClose = campaign?.closing_date
                  ? new Date(campaign.closing_date)
                  : new Date();
                const baseDate = currentClose > new Date() ? currentClose : new Date();
                const newClosing = new Date(baseDate.getTime() + numDays * 86_400_000);

                await supabaseAdmin
                  .from("campaigns")
                  .update({ closing_date: newClosing.toISOString() })
                  .eq("id", campaignId);
              }

              payment.status = "success";
              campaignStatus = campaignStatus;
            } else if (verification.status === "failed") {
              await supabaseAdmin
                .from("payments")
                .update({
                  status: "failed",
                  error_message: "Payment failed via PayChangu verification",
                  failed_at: new Date().toISOString(),
                })
                .eq("id", payment.id);

              await supabaseAdmin
                .from("invoices")
                .update({ status: "failed" })
                .eq("id", payment.invoice_id);

              payment.status = "failed";
            }
          }

          return json({
            txRef: payment.tx_ref,
            chargeId: payment.charge_id,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            paymentMethod: payment.payment_method,
            completedAt: payment.completed_at,
            campaignId,
            campaignStatus,
            publicToken,
          });
        } catch (error) {
          console.error("Failed to fetch charge status:", error);
          return json({ error: "Failed to fetch charge status" }, { status: 500 });
        }
      },
    },
  },
});
