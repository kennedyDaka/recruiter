/**
 * Tenant isolation core.
 *
 * The single source of truth for "which tenant may this request touch" is the
 * database — never the JWT claim. A session token can be stale (issued before
 * a workspace move) or, in the worst case, forged against the dev secret; the
 * profile row is the ground truth. Every layer (query proxy, auth middleware,
 * server functions) resolves the tenant from `profiles.tenant_id` here.
 */

import { from } from "@/lib/db";

/**
 * Tables whose rows belong to exactly one tenant. Browser queries against
 * these are auto-scoped by the proxy, and server functions get a scoped
 * `from()` (see tenantScopedFrom) so a forgotten filter can never cross
 * tenants. `profiles`, `tenants`, `auth_credentials` and the shared catalogs
 * deliberately stay unscoped — they are auth/global data, not tenant data.
 */
export const TENANT_SCOPED_TABLES = new Set([
  "campaigns",
  "applications",
  "candidates",
  "recruitment_stages",
  "communications",
  "candidate_education",
  "candidate_experience",
  "candidate_skills",
  "candidate_referees",
  "candidate_documents",
  "candidate_answers",
  "candidate_certifications",
  "notes",
  "interviews",
  "application_stage_history",
  "campaign_questions",
  "campaign_answer_options",
]);

/**
 * Resolves the authoritative auth state for a user from the database: the
 * tenant (never the JWT claim) plus the session version used to invalidate
 * tokens after a password change. Throws when the profile cannot be read.
 */
export async function resolveUserAuth(userId: string): Promise<{
  tenantId: string | null;
  sessionVersion: number;
}> {
  const profile = await from("profiles")
    .select("tenant_id, session_version")
    .eq("id", userId)
    .maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  return {
    tenantId: (profile.data?.tenant_id as string | null) ?? null,
    sessionVersion: Number(profile.data?.session_version ?? 0),
  };
}

/**
 * Resolves the authoritative tenant for a user from the database. Throws when
 * the profile cannot be read (callers decide how to treat a missing tenant).
 */
export async function resolveTenantIdForUser(userId: string): Promise<string | null> {
  const auth = await resolveUserAuth(userId);
  return auth.tenantId;
}

/**
 * Returns a `from()` whose builders are bound to `tenantId`:
 *   - SELECT / UPDATE / DELETE on tenant-scoped tables get `tenant_id = ?`
 *     injected into the WHERE clause unless the query already scopes, so a
 *     cross-tenant id affects zero rows.
 *   - INSERT / UPSERT stamp `tenant_id` with the bound tenant, so a client
 *     that passes another tenant's id in the payload is ignored.
 *
 * Server functions receive this as `context.supabase.from` — the guarantee
 * holds even if a handler forgets its own filter.
 */
export function tenantScopedFrom(tenantId: string | null) {
  return (table: string) => {
    const builder = from(table) as {
      __tenantScope?: string | null;
    } & ReturnType<typeof from>;
    if (tenantId && TENANT_SCOPED_TABLES.has(table)) {
      builder.__tenantScope = tenantId;
    }
    return builder;
  };
}
