import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, Loader2, MailX } from "lucide-react";
import { verifyEmailFn } from "@/lib/auth/functions";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Confirm your email — Operon Recruit" }],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const search = Route.useSearch();
  const verify = useServerFn(verifyEmailFn);
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [message, setMessage] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    const token = search.token ?? "";
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token. Request a new one from the sign-in page.");
      return;
    }
    ranRef.current = true;
    verify({ data: { token } })
      .then((result) => {
        // Establish the httpOnly session cookie via a full page load through
        // the callback route (server functions cannot set cookies in RPC).
        if (result?.token) {
          window.location.assign(`/session/callback?token=${encodeURIComponent(result.token)}`);
          return;
        }
        setState("ok");
      })
      .catch((error) => {
        setState("error");
        setMessage(
          error instanceof Error ? error.message : "This verification link is invalid or has expired.",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.token]);

  return (
    <div className="flex min-h-screen flex-col bg-secondary/30">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link to="/">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-14">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-md">
          {state === "checking" ? (
            <>
              <Loader2 className="mx-auto size-10 animate-spin text-primary" />
              <h1 className="mt-4 font-display text-xl font-semibold">Confirming your email…</h1>
            </>
          ) : state === "ok" ? (
            <>
              <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
              <h1 className="mt-4 font-display text-xl font-semibold">Email confirmed</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your account is verified — taking you to workspace setup.
              </p>
              <Button asChild className="mt-6 w-full">
                <Link to="/onboarding">Continue to workspace setup</Link>
              </Button>
            </>
          ) : (
            <>
              <MailX className="mx-auto size-10 text-amber-600" />
              <h1 className="mt-4 font-display text-xl font-semibold">Could not verify your email</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
              <Button asChild variant="outline" className="mt-6 w-full">
                <Link to="/auth" search={{ mode: "signin" }}>
                  Go to sign in and resend
                </Link>
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
