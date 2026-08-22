import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  signInFn,
  signUpFn,
  resendVerificationFn,
} from "@/lib/auth/functions";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Employer sign in — Operon Recruit" },
      {
        name: "description",
        content:
          "Sign in or create your Operon Recruit company workspace to manage hiring campaigns.",
      },
      { property: "og:title", content: "Employer sign in — Operon Recruit" },
      { property: "og:description", content: "Access your Operon Recruit hiring workspace." },
    ],
  }),
  component: AuthPage,
});

function safePath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function takeStoredDestination(fallback: string) {
  const storedDestination = sessionStorage.getItem("operon:redirect");
  sessionStorage.removeItem("operon:redirect");
  return safePath(storedDestination ?? fallback);
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const [resending, setResending] = useState(false);
  const [existingSessionEmail, setExistingSessionEmail] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot — never filled by humans
  const [turnstileToken, setTurnstileToken] = useState("");
  const [signupDone, setSignupDone] = useState(false);
  const formStartedAtRef = useRef(Date.now());

  const signIn = useServerFn(signInFn);
  const signUp = useServerFn(signUpFn);
  const resendVerification = useServerFn(resendVerificationFn);

  const destination = safePath(search.redirect);

  function isEmailNotConfirmed(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: string; message?: string };
    return (
      candidate.code === "email_not_confirmed" ||
      (typeof candidate.message === "string" && /email not confirmed/i.test(candidate.message))
    );
  }

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled || !data.user) return;

        if (search.mode === "signup") {
          setExistingSessionEmail(data.user.email ?? "your current account");
          return;
        }

        navigate({ to: takeStoredDestination(destination) });
      } catch {
        // Not signed in
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [destination, navigate, search.mode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const common = {
        website,
        startedAt: formStartedAtRef.current,
        turnstileToken,
      };
      if (mode === "signup") {
        await signUp({
          data: {
            email: email.trim(),
            password,
            fullName: fullName.trim(),
            origin: window.location.origin,
            ...common,
          },
        });
        // Sign-up always goes through email verification: no session is
        // created until the candidate clicks the link in their inbox.
        setSignupDone(true);
        setShowConfirmNotice(true);
      } else {
        const result = await signIn({
          data: {
            email: email.trim(),
            password,
            ...common,
          },
        });
        if (result?.token) {
          // Establish the httpOnly session cookie via a full page load through
          // the callback route (server functions cannot set cookies in RPC).
          window.location.assign(
            `/session/callback?token=${encodeURIComponent(result.token)}&redirect=${encodeURIComponent(
              takeStoredDestination(destination),
            )}`,
          );
        } else {
          toast.error("Sign in failed. Please try again.");
        }
      }
    } catch (error) {
      if (isEmailNotConfirmed(error)) {
        setShowConfirmNotice(true);
      } else {
        toast.error(error instanceof Error ? error.message : "Authentication failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setResending(true);
    try {
      await resendVerification({
        data: {
          email: email.trim(),
          origin: window.location.origin,
        },
      });
      toast.success("Verification email sent — check your inbox");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not resend the verification email",
      );
    } finally {
      setResending(false);
    }
  }

  async function handleGoogle() {
    const redirect = safePath(sessionStorage.getItem("operon:redirect") ?? destination);
    sessionStorage.setItem("operon:redirect", redirect);
    // Redirect to our server-side Google OAuth flow
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  }

  async function signOutForNewWorkspace() {
    setBusy(true);
    // Full page load so the server can delete the httpOnly session cookie.
    window.location.assign("/session/signout?redirect=" + encodeURIComponent("/auth?mode=signup"));
  }

  const hasExistingSignupSession = mode === "signup" && Boolean(existingSessionEmail);

  const passwordRules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "An uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "A lowercase letter", ok: /[a-z]/.test(password) },
    { label: "A number", ok: /[0-9]/.test(password) },
  ];
  const passwordStrong = passwordRules.every((rule) => rule.ok);

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
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-md">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {mode === "signup" ? "Create your workspace" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Set up an employer account to publish campaigns."
              : "Sign in to manage your hiring campaigns."}
          </p>

          {hasExistingSignupSession ? (
            <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
              <p className="font-medium">You are already signed in as {existingSessionEmail}.</p>
              <p className="mt-1 leading-6 text-muted-foreground">
                Continue to that workspace, or sign out before creating a company with a different
                account.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => navigate({ to: "/dashboard" })}>
                  Go to workspace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={signOutForNewWorkspace}
                  disabled={busy}
                >
                  Sign out and create another
                </Button>
              </div>
            </div>
          ) : showConfirmNotice && signupDone ? (
            /* After successful signup: replace the entire form with a prominent confirmation notice */
            <div className="mt-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
                ✉️
              </div>
              <h2 className="text-xl font-bold text-emerald-900">Check your inbox!</h2>
              <p className="mt-3 text-base leading-relaxed text-emerald-800">
                We sent a verification link to <span className="font-semibold">{email}</span>.
              </p>
              <p className="mt-2 text-sm text-emerald-700">
                Click the link in the email to activate your account, then sign in.
              </p>
              <p className="mt-2 text-xs text-emerald-600">
                Didn't get it? Check your spam folder or click below to resend.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Button
                  type="button"
                  variant="default"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={resending}
                  onClick={resendConfirmation}
                >
                  {resending ? "Sending…" : "Resend verification email"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowConfirmNotice(false);
                    setSignupDone(false);
                    setMode("signin");
                  }}
                >
                  Back to sign in
                </Button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {/* Honeypot — hidden from humans, tempting for bots. */}
                <div className="hidden" aria-hidden="true">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      maxLength={120}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                  {mode === "signin" ? (
                    <div className="pt-1 text-right">
                      <Link
                        to="/reset-password"
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                  ) : null}
                  {mode === "signup" ? (
                    <ul className="grid gap-1 pt-1">
                      {passwordRules.map((rule) => (
                        <li
                          key={rule.label}
                          className={`flex items-center gap-2 text-xs ${
                            rule.ok ? "text-emerald-600" : "text-muted-foreground"
                          }`}
                        >
                          <span>{rule.ok ? "✓" : "○"}</span>
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <RobotCheck
                  mode={mode}
                  token={turnstileToken}
                  onToken={setTurnstileToken}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    busy || (mode === "signup" && password.length > 0 && !passwordStrong)
                  }
                >
                  {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                </Button>
              </form>

              {showConfirmNotice && !signupDone ? (
                <div className="mt-5 rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Confirm your email</p>
                  <p className="mt-1 leading-relaxed">
                    Your account exists but its email hasn't been confirmed yet. Check your inbox (and spam folder) for the verification link, then sign in again.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={resending}
                    onClick={resendConfirmation}
                  >
                    {resending ? "Sending…" : "Resend verification email"}
                  </Button>
                </div>
              ) : null}

              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full" onClick={handleGoogle}>
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </Button>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signup" ? "Already have an account?" : "New to Operon Recruit?"}{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setShowConfirmNotice(false);
                    setSignupDone(false);
                    setMode(mode === "signup" ? "signin" : "signup");
                  }}
                >
                  {mode === "signup" ? "Sign in" : "Create one"}
                </button>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Robot check. When the Cloudflare Turnstile site key is configured
 * (VITE_TURNSTILE_SITE_KEY) this renders the widget and reports its token;
 * the server validates it only when TURNSTILE_SECRET_KEY is also set.
 * Without configuration it renders nothing — the honeypot field and
 * minimum-form-time checks still run on every submission.
 */
function RobotCheck({
  mode,
  token,
  onToken,
}: {
  mode: "signin" | "signup";
  token: string;
  onToken: (token: string) => void;
}) {
  const siteKey =
    (import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) ?? "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    let widgetId: string | undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current) return;
      const turnstile = (window as unknown as { turnstile?: any }).turnstile;
      if (!turnstile) return;
      try {
        turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: (value: string) => onToken(value),
        });
        setReady(true);
      } catch {
        // Widget failure must never block authentication — the server side
        // only enforces Turnstile when it is fully configured.
      }
    };

    const existing = (window as unknown as { turnstile?: any }).turnstile;
    if (existing) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId) {
        try {
          (window as unknown as { turnstile?: any }).turnstile?.remove(widgetId);
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, mode]);

  if (!siteKey) return null;
  return (
    <div>
      <div ref={containerRef} className="min-h-16" />
      {!ready ? (
        <p className="text-xs text-muted-foreground">Loading security check…</p>
      ) : null}
      {token ? (
        <p className="mt-1 text-xs text-emerald-600">✓ Security check passed</p>
      ) : null}
    </div>
  );
}
