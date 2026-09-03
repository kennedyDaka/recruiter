import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LoaderCircle } from "lucide-react";
import { establishSessionFn } from "@/lib/auth/session.functions";

/**
 * Session hand-off route. Full page loads land here (never client-side
 * navigation) so the server can set the httpOnly session cookie in the SSR
 * response headers — the only reliable way to establish an httpOnly cookie
 * with server functions in this stack. It then forwards to the destination.
 */
const searchSchema = z.object({
  token: z.string().optional(),
  redirect: z.string().optional(),
});

function safeTarget(value?: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export const Route = createFileRoute("/session/callback")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Signing you in — RecruiterMW" }] }),
  loader: async ({ location }) => {
    const search = (location.search ?? {}) as { token?: string; redirect?: string };

    let verified = false;
    let tenantId: string | null = null;
    let role: string | null = null;
    if (search.token) {
      const result = await establishSessionFn({ data: { token: search.token } });
      verified = Boolean(result?.verified);
      tenantId = result?.tenantId ?? null;
      role = (result as any)?.role ?? null;
    }
    const fallback = role === "super_admin" ? "/admin" : tenantId ? "/dashboard" : "/onboarding";
    return { verified, target: verified ? safeTarget(search.redirect ?? fallback) : "/auth" };
  },
  component: SessionCallbackPage,
});

function SessionCallbackPage() {
  const data = Route.useLoaderData();
  useEffect(() => {
    window.location.replace(data.target);
  }, [data.target]);

  return (
    <main className="grid min-h-screen place-items-center bg-secondary/30 px-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        {data.verified ? (
          <>
            <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {data.target === "/onboarding"
                ? "Email verified — taking you to workspace setup…"
                : "Signing you in…"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Redirecting…</p>
        )}
      </section>
    </main>
  );
}
