import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Reads the current session from the httpOnly cookie on the server.
 * The browser cannot see an httpOnly cookie, so client-side gates must ask
 * the server instead of parsing document.cookie.
 */
export const getCurrentSessionFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
    const session = await getSessionFromCookieServer();
    if (!session) return null;
    // Authoritative tenant from the database, not the JWT claim.
    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
    const tenantId = await resolveTenantIdForUser(session.userId);
    return {
      userId: session.userId,
      email: session.email,
      tenantId,
    };
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
    return { verified: Boolean(payload), tenantId: payload?.tenantId ?? null };
  });

/** Deletes the httpOnly session cookie (called from the sign-out route loader). */
export const clearSessionFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { clearSessionServer } = await import("@/lib/auth/session.server");
    await clearSessionServer();
    return { ok: true };
  },
);
