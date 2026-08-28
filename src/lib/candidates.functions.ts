import { createServerFn } from "@tanstack/react-start";

/** Fetch all candidates/applications for the authenticated user's tenant. */
export const getTenantCandidatesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSessionFromCookieServer } = await import(
      "@/lib/auth/session.server"
    );

    const session = await getSessionFromCookieServer();
    if (!session) return [];

    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
    const tenantId = await resolveTenantIdForUser(session.userId);
    if (!tenantId) return [];

    const res = await supabaseAdmin
      .from("applications")
      .select(
        "id, reference, score, recommendation, eligibility_status, years_experience, highest_qualification, submitted_at, candidates(first_name, last_name, email, phone, location)"
      )
      .eq("tenant_id", tenantId)
      .order("score", { ascending: false });

    return res.data ?? [];
  },
);
