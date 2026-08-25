import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payment/status/$txRef")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { txRef } = params;
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("payments")
            .select("tx_ref, status, amount, currency, payment_method, completed_at, invoice_id")
            .eq("tx_ref", txRef)
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            return json({ error: "Payment not found" }, { status: 404 });
          }

          // Look up campaign_id from the invoice
          let campaignId: string | null = null;
          if (data.invoice_id) {
            const { data: invoice } = await supabaseAdmin
              .from("invoices")
              .select("campaign_id")
              .eq("id", data.invoice_id)
              .maybeSingle();
            campaignId = invoice?.campaign_id ?? null;
          }

          return json({
            txRef: data.tx_ref,
            status: data.status,
            amount: data.amount,
            currency: data.currency,
            paymentMethod: data.payment_method,
            completedAt: data.completed_at,
            campaignId,
          });
        } catch (error) {
          console.error("Failed to fetch payment status:", error);
          return json({ error: "Failed to fetch payment status" }, { status: 500 });
        }
      },
    },
  },
});
