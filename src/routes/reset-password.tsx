import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, LockKeyhole } from "lucide-react";
import {
  getResetTokenStateFn,
  requestPasswordResetFn,
  resetPasswordFn,
} from "@/lib/auth/functions";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Reset your password — RecruiterMW" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const search = Route.useSearch();
  const token = search.token ?? "";
  const requestReset = useServerFn(requestPasswordResetFn);
  const getTokenState = useServerFn(getResetTokenStateFn);
  const doReset = useServerFn(resetPasswordFn);

  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const formStartedAtRef = useRef(Date.now());

  const [tokenState, setTokenState] = useState<"checking" | "valid" | "expired" | "used">(
    token ? "checking" : "used",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!token || checkedRef.current) return;
    checkedRef.current = true;
    getTokenState({ data: { token } })
      .then((result) => setTokenState((result?.state as "valid" | "expired" | "used") ?? "used"))
      .catch(() => setTokenState("used"));
  }, [token, getTokenState]);

  const passwordRules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "An uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "A lowercase letter", ok: /[a-z]/.test(password) },
    { label: "A number", ok: /[0-9]/.test(password) },
  ];
  const passwordStrong = passwordRules.every((rule) => rule.ok);
  const passwordsMatch = confirm.length === 0 || password === confirm;

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestReset({
        data: {
          email: email.trim(),
          website,
          startedAt: formStartedAtRef.current,
          origin: window.location.origin,
        },
      });
      setRequested(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the reset link");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    if (!passwordStrong) {
      toast.error("Choose a password that meets all the requirements.");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setResetting(true);
    try {
      await doReset({ data: { token, password } });
      setDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset the password");
    } finally {
      setResetting(false);
    }
  }

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
          {!token ? (
            // ── Request a reset link ───────────────────────────────
            requested ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
                <h1 className="mt-4 font-display text-xl font-semibold">Check your inbox</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  If an account exists for <span className="font-medium">{email}</span>, we sent a
                  reset link. It expires in 1 hour.
                </p>
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link to="/auth" search={{ mode: "signin" }}>
                    Back to sign in
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <KeyRound className="size-5" />
                  </div>
                  <h1 className="font-display text-xl font-semibold">Reset your password</h1>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Enter the email address for your account and we'll send you a secure link to
                  choose a new password.
                </p>
                <form onSubmit={handleRequest} className="mt-6 space-y-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="resetEmail">Email</Label>
                    <Input
                      id="resetEmail"
                      type="email"
                      required
                      maxLength={255}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Remembered it?{" "}
                  <Link to="/auth" search={{ mode: "signin" }} className="font-medium text-primary underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )
          ) : tokenState === "checking" ? (
            <div className="text-center">
              <Loader2 className="mx-auto size-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Checking your reset link…</p>
            </div>
          ) : tokenState === "valid" && !done ? (
            // ── Choose a new password ─────────────────────────────
            <>
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <LockKeyhole className="size-5" />
                </div>
                <h1 className="font-display text-xl font-semibold">Choose a new password</h1>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Pick a strong password for your RecruiterMW account.
              </p>
              <form onSubmit={handleReset} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  {!passwordsMatch ? (
                    <p className="text-xs text-rose-600">Passwords do not match.</p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetting || (password.length > 0 && !passwordStrong)}
                >
                  {resetting ? "Saving…" : "Set new password"}
                </Button>
              </form>
            </>
          ) : done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
              <h1 className="mt-4 font-display text-xl font-semibold">Password updated</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your password has been changed and any other signed-in sessions were ended. Sign in
                with your new password.
              </p>
              <Button asChild className="mt-6 w-full">
                <Link to="/auth" search={{ mode: "signin" }}>
                  Go to sign in
                </Link>
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <KeyRound className="mx-auto size-10 text-amber-600" />
              <h1 className="mt-4 font-display text-xl font-semibold">
                {tokenState === "expired" ? "Reset link expired" : "Reset link no longer valid"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tokenState === "expired"
                  ? "This link expired after 1 hour. Request a fresh one and use it within the hour."
                  : "This link has already been used or is invalid. Request a fresh one."}
              </p>
              <Button asChild className="mt-6 w-full">
                <Link to="/reset-password">Request a new link</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
