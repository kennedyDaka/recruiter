import { createServerFn } from "@tanstack/react-start";

/**
 * Server function to fetch admin dashboard stats.
 * Runs on the server where RLS is bypassed via service-role key.
 */
export const getAdminStatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [
      tenantsRes,
      campaignsRes,
      activeCampaignsRes,
      applicationsRes,
      paymentsRes,
      usersRes,
      incidentsRes,
    ] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name, industry, country, created_at"),
      supabaseAdmin.from("campaigns").select("id, name, status, tenant_id, created_at"),
      supabaseAdmin.from("campaigns").select("id").eq("status", "active"),
      supabaseAdmin.from("applications").select("id, score, status, created_at"),
      supabaseAdmin.from("payments").select("id, amount, currency, status, created_at"),
      supabaseAdmin.from("profiles").select("id, email, full_name, created_at"),
      supabaseAdmin.from("incidents").select("id, status, priority"),
    ]);

    const tenants = tenantsRes.data ?? [];
    const campaigns = campaignsRes.data ?? [];
    const applications = applicationsRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const incidents = incidentsRes.data ?? [];
    const users = usersRes.data ?? [];

    const totalRevenue = payments
      .filter((p) => ["success", "completed", "paid"].includes(p.status))
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const avgScore = applications.length
      ? Math.round(
          applications.reduce((s, a) => s + (a.score ?? 0), 0) / applications.length,
        )
      : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentApps = applications.filter(
      (a) => new Date(a.created_at) > thirtyDaysAgo,
    ).length;

    const openIncidents = incidents.filter(
      (i) => !["resolved", "closed"].includes(i.status),
    );
    const criticalIncidents = openIncidents.filter(
      (i) => i.priority === "critical",
    );

    return {
      totalTenants: tenants.length,
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCampaignsRes.data?.length ?? 0,
      totalApplications: applications.length,
      recentApplications: recentApps,
      totalRevenue,
      avgScore,
      totalUsers: users.length,
      openIncidents: openIncidents.length,
      criticalIncidents: criticalIncidents.length,
      tenants: tenants.slice(0, 10),
      recentPayments: payments
        .filter((p) => ["success", "completed", "paid"].includes(p.status))
        .slice(0, 5),
    };
  },
);
