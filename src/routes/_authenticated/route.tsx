import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentSessionFn } from "@/lib/auth/session.functions";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedGate,
});

function AuthenticatedGate() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const getSession = useServerFn(getCurrentSessionFn);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"checking" | "authorized" | "error">("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("checking");
    setErrorMessage("");

    async function verifyAccess() {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        // Keep the original protected page even if a pending navigation causes this
        // effect to run again while the Auth client is resolving.
        const storedRedirect = sessionStorage.getItem("operon:redirect");
        const redirect = pathname === "/auth" ? (storedRedirect ?? "/dashboard") : pathname;
        sessionStorage.setItem("operon:redirect", redirect);
        navigate({ to: "/auth", search: { redirect }, replace: true });
        return;
      }

      if (!session.tenantId && pathname !== "/onboarding") {
        navigate({ to: "/onboarding", replace: true });
        return;
      }

      setState("authorized");
    }

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [attempt, getSession, navigate, pathname]);

  if (state === "authorized") return <Outlet />;

  return (
    <main className="grid min-h-screen place-items-center bg-secondary/30 px-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        {state === "error" ? (
          <>
            <h1 className="font-display text-lg font-semibold">Workspace check failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <Button className="mt-5" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto size-5 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Checking your workspace…</p>
          </>
        )}
      </section>
    </main>
  );
}
