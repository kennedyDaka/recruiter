import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface PaymentHistoryItem {
  id: string;
  tx_ref: string;
  charge_id: string | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  phone_number: string | null;
  status: string;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
  campaign_name: string | null;
  campaign_id: string | null;
  num_days: number | null;
}

export const getPaymentHistoryFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const schema = z.object({
      limit: z.number().int().positive().max(100).default(50),
      offset: z.number().int().min(0).default(0),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<{ items: PaymentHistoryItem[]; total: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");

    const session = await getSessionFromCookieServer();
    if (!session) throw new Error("Sign in required");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) throw new Error("No tenant bound to this account");

    // Fetch payments with campaign info
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select(`
        id, tx_ref, charge_id, amount, currency, payment_method,
        phone_number, status, error_message, completed_at, created_at,
        invoice_id,
        invoices!inner(campaign_id, metadata)
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (error) throw error;

    // Get campaign names for each payment
    const items: PaymentHistoryItem[] = [];

    for (const p of payments ?? []) {
      const invoice = p.invoices as { campaign_id: string | null; metadata: string | null } | null;
      const meta = invoice?.metadata ? JSON.parse(invoice.metadata as string) : {};

      let campaignName: string | null = null;
      if (invoice?.campaign_id) {
        const { data: campaign } = await supabaseAdmin
          .from("campaigns")
          .select("name")
          .eq("id", invoice.campaign_id)
          .maybeSingle();
        campaignName = campaign?.name ?? null;
      }

      items.push({
        id: p.id,
        tx_ref: p.tx_ref,
        charge_id: p.charge_id,
        amount: p.amount,
        currency: p.currency,
        payment_method: p.payment_method,
        phone_number: p.phone_number,
        status: p.status,
        error_message: p.error_message,
        completed_at: p.completed_at,
        created_at: p.created_at,
        campaign_name: campaignName,
        campaign_id: invoice?.campaign_id ?? null,
        num_days: meta.num_days ?? null,
      });
    }

    // Get total count
    const { count } = await supabaseAdmin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    return { items, total: count ?? 0 };
  });
