import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Reads the current session from the httpOnly cookie on the server.
 * The browser cannot see an httpOnly cookie, so client-side gates must ask
 * the server instead of parsing document.cookie.
 */
export const getCurrentSessionFn = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
      const session = await getSessionFromCookieServer();
      if (!session) return null;

      // Authoritative tenant from the database, not the JWT claim.
      let tenantId: string | null = null;
      try {
        const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
        tenantId = await resolveTenantIdForUser(session.userId);
      } catch {
        // Tenant resolution can fail — admin users may not have a tenant.
      }

      // Check for super_admin role (no tenant needed)
      let role = "company_admin";
      try {
        const { dbQueryFirst } = await import("@/lib/db");
        const roleRow = await dbQueryFirst(
          "SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1",
          [session.userId],
        );
        role = (roleRow?.role as string) ?? "company_admin";
      } catch {
        // Role query failed — default to company_admin (non-admin).
      }

      return {
        userId: session.userId,
        email: session.email,
        tenantId,
        role,
      };
    } catch {
      // Session cookie read/verify failed.
      return null;
    }
  },
);

/**
 * Verifies a session token and writes the httpOnly cookie. Route loaders and
 * SSR pages call this so the cookie lands in the SSR response headers (server
 * functions invoked during SSR share the request's response).
 */
export const establishSessionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifySession } = await import("@/lib/auth/session");
    const { setSessionCookieServer } = await import("@/lib/auth/session.server");
    const payload = await verifySession(data.token);
    if (payload) await setSessionCookieServer(data.token);
    // Look up role so session callback can redirect super_admin to /admin
    let role: string | null = null;
    if (payload?.userId) {
      const { dbQueryFirst } = await import("@/lib/db");
      const roleRow = await dbQueryFirst(
        "SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1",
        [payload.userId],
      );
      role = (roleRow?.role as string) ?? null;
    }
    return { verified: Boolean(payload), tenantId: payload?.tenantId ?? null, role };
  });

/** Deletes the httpOnly session cookie (called from the sign-out route loader). */
export const clearSessionFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { clearSessionServer } = await import("@/lib/auth/session.server");
    await clearSessionServer();
    return { ok: true };
  },
);
