/**
 * Auth attacher middleware — reads JWT session from cookie, attaches to server function context.
 */

import { createMiddleware } from "@tanstack/react-start";
import { getSessionFromCookieServer } from "@/lib/auth/session.server";
import { from } from "@/lib/db";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await getSessionFromCookieServer();

  return next({
    context: {
      userId: session?.userId ?? "anonymous",
      claims: session
        ? { email: session.email, tenantId: session.tenantId, role: session.role }
        : ({} as Record<string, unknown>),
      supabase: { from },
    },
  });
});
