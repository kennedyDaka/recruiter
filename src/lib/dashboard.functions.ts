import { createServerFn } from "@tanstack/react-start";

/** Fetch dashboard data for the authenticated user's tenant. */
export const getDashboardFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getCurrentSessionFn } = await import(
      "@/lib/auth/session.functions"
    );
    // Get the session to find the tenant
    const { dbQuery } = await import("@/lib/db");
    const { getSessionFromCookieServer } = await import(
      "@/lib/auth/session.server"
    );

    const session = await getSessionFromCookieServer();
    if (!session) return { campaigns: [], applications: [] };

    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) return { campaigns: [], applications: [] };

    const campaigns = await dbQuery(
      "SELECT id, name, job_title, status, closing_date, slug FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC",
      [tenantId],
    );

    const applications = await dbQuery(
      "SELECT a.id, a.reference, a.score, a.recommendation, a.status, a.created_at, a.campaign_id FROM applications a JOIN campaigns c ON a.campaign_id = c.id WHERE c.tenant_id = $1 ORDER BY a.score DESC LIMIT 8",
      [tenantId],
    );

    return { campaigns, applications };
  },
);
