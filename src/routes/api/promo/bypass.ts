import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

export const Route = createFileRoute("/api/promo/bypass")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getSessionFromCookieServer } = await import(
            "@/lib/auth/session.server"
          );
          const { resolveTenantIdForUser } = await import(
            "@/lib/tenant-guard"
          );

          const session = await getSessionFromCookieServer();
          if (!session) {
            return json({ error: "Sign in required" }, { status: 401 });
          }
          const tenantId = await resolveTenantIdForUser(session.userId);
          if (!tenantId) {
            return json({ error: "No tenant bound" }, { status: 403 });
          }

          const body = await request.json();
          const schema = z.object({
            code: z.string().min(1),
            campaignId: z.string().uuid(),
            numDays: z.number().int().min(1).max(365),
          });
          const data = schema.parse(body);

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { DAILY_RATE } = await import("@/lib/payment/pricing");

          // Validate promo code
          const codeHash = createHash("sha256")
            .update(data.code.toUpperCase().trim())
            .digest("hex");

          const { data: promoCode } = await supabaseAdmin
            .from("promo_codes")
            .select(
              "id, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, active",
            )
            .eq("code_hash", codeHash)
            .maybeSingle();

          if (!promoCode || !promoCode.active) {
            return json({ error: "Invalid promo code" }, { status: 400 });
          }

          const now = new Date();
          if (
            new Date(promoCode.valid_until) < now ||
            new Date(promoCode.valid_from) > now
          ) {
            return json(
              { error: "Promo code expired or not yet active" },
              { status: 400 },
            );
          }

          if (promoCode.used_count >= promoCode.max_uses) {
            return json(
              { error: "Promo code fully used" },
              { status: 400 },
            );
          }

          // Verify campaign belongs to tenant
          const { data: campaign } = await supabaseAdmin
            .from("campaigns")
            .select("id, tenant_id, name")
            .eq("id", data.campaignId)
            .maybeSingle();

          if (!campaign || campaign.tenant_id !== tenantId) {
            return json({ error: "Campaign not found" }, { status: 404 });
          }

          // Check if already paid
          const { data: existingInvoice } = await supabaseAdmin
            .from("invoices")
            .select("id")
            .eq("campaign_id", data.campaignId)
            .eq("status", "paid")
            .limit(1)
            .maybeSingle();

          if (existingInvoice) {
            return json(
              { error: "Campaign already activated" },
              { status: 409 },
            );
          }

          // Calculate discount
          const baseAmount = DAILY_RATE * data.numDays;
          let finalAmount = 0;
          let discountApplied = baseAmount;

          if (promoCode.discount_type === "percentage") {
            finalAmount = Math.round(
              baseAmount * ((100 - promoCode.discount_value) / 100),
            );
            discountApplied = baseAmount - finalAmount;
          }
          // If "free", finalAmount stays 0

          // Get default plan
          const { data: plan } = await supabaseAdmin
            .from("plans")
            .select("id")
            .eq("active", true)
            .order("sort_order")
            .limit(1)
            .maybeSingle();

          if (!plan) {
            return json({ error: "No active plan" }, { status: 500 });
          }

          // Create invoice
          const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
          const { data: invoice, error: invError } = await supabaseAdmin
            .from("invoices")
            .insert({
              tenant_id: tenantId,
              plan_id: plan.id,
              campaign_id: data.campaignId,
              invoice_number: invoiceNumber,
              amount: finalAmount,
              currency: "MWK",
              status: finalAmount === 0 ? "paid" : "pending",
              paid_at: finalAmount === 0 ? new Date().toISOString() : null,
              metadata: JSON.stringify({
                num_days: data.numDays,
                daily_rate: DAILY_RATE,
                promo_code: data.code.toUpperCase().trim(),
                promo_code_id: promoCode.id,
                discount_type: promoCode.discount_type,
                discount_value: promoCode.discount_value,
                original_amount: baseAmount,
                discount_applied: discountApplied,
                bypass: finalAmount === 0,
              }),
            })
            .select("id, invoice_number, amount, currency, status")
            .single();

          if (invError) {
            console.error("Invoice creation error:", invError);
            return json({ error: "Failed to create invoice" }, { status: 500 });
          }

          // If free, create payment record and activate campaign
          if (finalAmount === 0) {
            const txRef = `TX-PROMO-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

            await supabaseAdmin.from("payments").insert({
              tenant_id: tenantId,
              invoice_id: invoice.id,
              provider: "promo_bypass",
              tx_ref: txRef,
              amount: 0,
              currency: "MWK",
              payment_method: "promo_bypass",
              status: "success",
              completed_at: new Date().toISOString(),
              metadata: JSON.stringify({
                promo_code: data.code.toUpperCase().trim(),
                promo_code_id: promoCode.id,
                bypass: true,
              }),
            });

            // Activate campaign
            const closingDate = new Date();
            closingDate.setDate(closingDate.getDate() + data.numDays);

            await supabaseAdmin
              .from("campaigns")
              .update({
                status: "active",
                closing_date: closingDate.toISOString(),
                published_at: new Date().toISOString(),
              })
              .eq("id", data.campaignId);

            // Create subscription
            await supabaseAdmin.from("subscriptions").insert({
              tenant_id: tenantId,
              plan_id: plan.id,
              invoice_id: invoice.id,
              status: "active",
              current_period_start: new Date().toISOString(),
              current_period_end: closingDate.toISOString(),
            });

            // Increment promo code usage
            await supabaseAdmin
              .from("promo_codes")
              .update({ used_count: promoCode.used_count + 1 })
              .eq("id", promoCode.id);

            // Record usage
            await supabaseAdmin.from("promo_code_usages").insert({
              promo_code_id: promoCode.id,
              user_id: session.userId,
              tenant_id: tenantId,
              invoice_id: invoice.id,
              campaign_id: data.campaignId,
              discount_applied: discountApplied,
            });

            return json({
              success: true,
              bypass: true,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              amount: 0,
              message: "Campaign activated with promo code!",
            });
          }

          // If partial discount, still need payment for remaining
          return json({
            success: true,
            bypass: false,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            amount: finalAmount,
            originalAmount: baseAmount,
            discountApplied,
            message: `${promoCode.discount_value}% discount applied. Pay ${finalAmount.toLocaleString()} MWK remaining.`,
          });
        } catch (error: any) {
          console.error("Promo bypass error:", error);
          return json(
            { error: error.message ?? "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
