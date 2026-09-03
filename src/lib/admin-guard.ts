import { createServerFn } from "@tanstack/react-start";

/**
 * Server-side role check — verifies the current user is a super_admin.
 * Returns the session if authorized, throws if not.
 */
export const requireSuperAdminFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getSessionFromCookieServer } = await import(
      "@/lib/auth/session.server"
    );
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const session = await getSessionFromCookieServer();
    if (!session) {
      throw new Error("Sign in required");
    }

    // Check role from database (never trust JWT alone)
    const { data: userRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", session.userId)
      .limit(1)
      .maybeSingle();

    if (userRole?.role !== "super_admin") {
      throw new Error("Super admin access required");
    }

    return { userId: session.userId, role: "super_admin" as const };
  },
);
