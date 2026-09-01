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
      `SELECT a.id, a.reference, a.score, a.recommendation, a.status, a.created_at,
              a.campaign_id, a.highest_qualification, a.years_experience,
              c.first_name, c.last_name, c.email, c.phone, c.location,
              cam.job_title AS campaign_title
       FROM applications a
       JOIN campaigns cam ON a.campaign_id = cam.id
       LEFT JOIN candidates c ON a.candidate_id = c.id
       WHERE cam.tenant_id = $1
       ORDER BY a.score DESC
       LIMIT 12`,
      [tenantId],
    );

    // Fetch skills for the returned applications
    if (applications.length > 0) {
      const appIds = applications.map((a: any) => a.id);
      const skillsRows = await dbQuery(
        `SELECT application_id, skill FROM candidate_skills
         WHERE application_id = ANY($1)`,
        [appIds],
      );
      const skillsMap = new Map<string, string[]>();
      for (const row of skillsRows as any[]) {
        const list = skillsMap.get(row.application_id) ?? [];
        list.push(row.skill);
        skillsMap.set(row.application_id, list);
      }
      for (const app of applications) {
        (app as any).skills = skillsMap.get(app.id) ?? [];
      }
    }

    return { campaigns, applications };
  },
);
