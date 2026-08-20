import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Guarantees the signed-in user has a profile and a tenant workspace.
 * Runs on first sign-in (email/password or Google) so recruiters can create
 * campaigns immediately instead of hitting "workspace is still being set up".
 */
export const ensureWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureWorkspaceForUser } = await import("@/lib/workspace.server");
    return ensureWorkspaceForUser({
      userId: context.userId,
      claims: context.claims as Record<string, unknown> | undefined,
    });
  });
