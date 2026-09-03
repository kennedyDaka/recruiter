import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface AdminTransactionItem {
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
  tenant_name: string | null;
  tenant_id: string;
  num_days: number | null;
  promo_code_used: string | null;
}

export const getAllTransactionsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const schema = z.object({
      limit: z.number().int().positive().max(100).default(20),
      offset: z.number().int().min(0).default(0),
      status: z.string().optional(),
      search: z.string().optional(),
    });
    return schema.parse(input);
  })
  .handler(
    async ({
      data,
    }): Promise<{ items: AdminTransactionItem[]; total: number }> => {
      // Verify super_admin
      const { requireSuperAdminFn } = await import("@/lib/admin-guard");
      await requireSuperAdminFn();

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      // Fetch payments with campaign and tenant info
      let query = supabaseAdmin
        .from("payments")
        .select(
          `
          id, tx_ref, charge_id, amount, currency, payment_method,
          phone_number, status, error_message, completed_at, created_at,
          tenant_id,
          invoice_id,
          invoices!inner(campaign_id, metadata, promo_code)
        `,
          { count: "exact" },
        )
        .order("created_at", { ascending: false });

      if (data.status && data.status !== "all") {
        query = query.eq("status", data.status);
      }

      const { data: payments, error, count } = await query.range(
        data.offset,
        data.offset + data.limit - 1,
      );

      if (error) throw error;

      // Get unique tenant IDs and campaign IDs
      const tenantIds = [...new Set((payments ?? []).map((p) => p.tenant_id))];
      const campaignIds = [
        ...new Set(
          (payments ?? [])
            .map((p) => (p.invoices as any)?.campaign_id)
            .filter(Boolean),
        ),
      ];

      // Fetch tenant names
      const tenantMap: Record<string, string> = {};
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabaseAdmin
          .from("tenants")
          .select("id, name")
          .in("id", tenantIds);
        (tenants ?? []).forEach((t) => {
          tenantMap[t.id] = t.name;
        });
      }

      // Fetch campaign names
      const campaignMap: Record<string, string> = {};
      if (campaignIds.length > 0) {
        const { data: campaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id, name")
          .in("id", campaignIds);
        (campaigns ?? []).forEach((c) => {
          campaignMap[c.id] = c.name;
        });
      }

      const items: AdminTransactionItem[] = (payments ?? []).map((p) => {
        const invoice = p.invoices as {
          campaign_id: string | null;
          metadata: string | null;
          promo_code: string | null;
        } | null;
        const meta = invoice?.metadata
          ? JSON.parse(invoice.metadata as string)
          : {};

        return {
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
          campaign_name: campaignMap[invoice?.campaign_id ?? ""] ?? null,
          campaign_id: invoice?.campaign_id ?? null,
          tenant_name: tenantMap[p.tenant_id] ?? null,
          tenant_id: p.tenant_id,
          num_days: meta.num_days ?? null,
          promo_code_used: invoice?.promo_code ?? null,
        };
      });

      // Apply search filter
      let filtered = items;
      if (data.search) {
        const s = data.search.toLowerCase();
        filtered = items.filter(
          (item) =>
            item.tx_ref.toLowerCase().includes(s) ||
            item.tenant_name?.toLowerCase().includes(s) ||
            item.campaign_name?.toLowerCase().includes(s) ||
            item.phone_number?.includes(s),
        );
      }

      return { items: filtered, total: count ?? 0 };
    },
  );
