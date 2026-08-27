import { createServerFn } from "@tanstack/react-start";

/** Fetch all campaigns for the authenticated user's tenant. */
export const getTenantCampaignsFn = createServerFn({ method: "GET" }).handler(
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
      `SELECT id, name, job_title, location, employment_type, closing_date, status, created_at, public_token
       FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );

    return rows;
  },
);

/** Fetch a single campaign with full details. */
export const getCampaignDetailFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const { z } = require("zod");
    return z.object({ campaignId: z.string() }).parse(input);
  })
  .handler(async ({ data }) => {
    const { dbQueryFirst } = await import("@/lib/db");
    const { getSessionFromCookieServer } = await import(
      "@/lib/auth/session.server"
    );

    const session = await getSessionFromCookieServer();
    if (!session) return null;

    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) return null;

    const campaign = await dbQueryFirst(
      `SELECT c.*, t.name as tenant_name, t.email as tenant_email
       FROM campaigns c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [data.campaignId, tenantId],
    );

    return campaign ?? null;
  });
