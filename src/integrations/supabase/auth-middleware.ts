/**
 * Auth middleware — reads JWT session from cookie, attaches user context + supabase client.
 * The tenant attached to context is resolved from the database (profiles.tenant_id),
 * never trusted from the JWT claim, so a stale or forged claim cannot cross tenants.
 */

import { createMiddleware } from "@tanstack/react-start";
import { getSessionFromCookieServer } from "@/lib/auth/session.server";
import { from } from "@/lib/db";
import { resolveUserAuth, tenantScopedFrom } from "@/lib/tenant-guard";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await getSessionFromCookieServer();

  if (!session) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/auth" },
    });
  }

  // Authoritative tenant + session version from the database — the JWT's
  // tenantId is advisory only and is deliberately overridden by the profile
  // row. A token whose sessionVersion lags the profile (password changed,
  // reset performed) is treated as signed out.
  const auth = await resolveUserAuth(session.userId);
  if ((session.sessionVersion ?? 0) !== auth.sessionVersion) {
    const { clearSessionServer } = await import("@/lib/auth/session.server");
    await clearSessionServer();
    throw new Response(null, {
      status: 302,
      headers: { Location: "/auth" },
    });
  }
  const tenantId = auth.tenantId;

  return next({
    context: {
      userId: session.userId,
      // DB-authoritative tenant for handlers to trust (may be null pre-onboarding).
      tenantId,
      claims: {
        email: session.email,
        tenantId,
        role: session.role,
      } as Record<string, unknown>,
      // Every server-function query goes through the tenant-scoped builder:
      // reads/updates/deletes inject tenant_id, inserts stamp it.
      supabase: { from: tenantScopedFrom(tenantId) },
    },
  });
});

export { from };
