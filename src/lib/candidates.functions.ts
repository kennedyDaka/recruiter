import { createServerFn } from "@tanstack/react-start";

/** Fetch all candidates/applications for the authenticated user's tenant. */
export const getTenantCandidatesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { dbQuery } = await import("@/lib/db");
    const { getSessionFromCookieServer } = await import(
      "@/lib/auth/session.server"
    );

    const session = await getSessionFromCookieServer();
    if (!session) return [];

    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) return [];

    const rows = await dbQuery(
      `SELECT a.id, a.reference, a.score, a.recommendation, a.eligibility_status,
              a.years_experience, a.highest_qualification, a.submitted_at,
              c.first_name, c.last_name, c.email, c.phone, c.location
       FROM applications a
       JOIN candidates c ON a.candidate_id = c.id
       JOIN campaigns cam ON a.campaign_id = cam.id
       WHERE cam.tenant_id = $1
       ORDER BY a.score DESC`,
      [tenantId],
    );

    return rows;
  },
);
