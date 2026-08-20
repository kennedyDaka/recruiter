import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerCompany } from "@/lib/registration.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up company workspace — Operon Recruit" },
      {
        name: "description",
        content: "Set up your company workspace before creating a recruitment campaign.",
      },
    ],
  }),
  component: CompanyOnboarding,
});

function CompanyOnboarding() {
  const navigate = useNavigate();
  const register = useServerFn(registerCompany);
  const [form, setForm] = useState({
    companyName: "",
    industry: "",
    country: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    fullName: "",
    adminPhone: "",
    autoPipelineEnabled: false,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const metadata = user.user_metadata as { full_name?: unknown } | undefined;
      setForm((current) => ({
        ...current,
        email: user.email ?? current.email,
        fullName: typeof metadata?.full_name === "string" ? metadata.full_name : current.fullName,
      }));
    });
  }, []);

  const saveWorkspace = useMutation<
    { tenantId: string; created: boolean; token?: string },
    Error,
    void
  >({
    mutationFn: async () => {
      const result = (await register({ data: form })) as {
        tenantId: string;
        created: boolean;
        token?: string;
      };
      return result;
    },
    onSuccess: (result) => {
      // Establish the refreshed session cookie (now carrying the tenant id)
      // via a full page load through the callback route.
      toast.success("Company workspace created");
      if (result?.token) {
        window.location.assign(`/session/callback?token=${encodeURIComponent(result.token)}&redirect=/dashboard`);
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

async function signOut() {
    // Full page load so the server can delete the httpOnly session cookie.
    window.location.assign("/session/signout?redirect=" + encodeURIComponent("/auth?mode=signup"));
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <section className="rounded-xl border border-border bg-card p-6 shadow-md sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Company setup
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                Create your company workspace
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                These details identify your organisation on recruitment campaigns and candidate
                applications.
              </p>
            </div>
          </div>

          <form
            className="mt-8 grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveWorkspace.mutate();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Company name" htmlFor="companyName">
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(event) => set("companyName")(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Industry" htmlFor="industry">
                <Input
                  id="industry"
                  value={form.industry}
                  onChange={(event) => set("industry")(event.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="Country" htmlFor="country">
                <Input
                  id="country"
                  value={form.country}
                  onChange={(event) => set("country")(event.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  value={form.city}
                  onChange={(event) => set("city")(event.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="Company email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => set("email")(event.target.value)}
                  maxLength={255}
                  required
                />
              </Field>
              <Field label="Company phone" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => set("phone")(event.target.value)}
                  maxLength={40}
                />
              </Field>
              <Field label="Website" htmlFor="website">
                <Input
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(event) => set("website")(event.target.value)}
                  maxLength={255}
                />
              </Field>
              <Field label="Administrator name" htmlFor="fullName">
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(event) => set("fullName")(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
            </div>
            <Field label="Administrator phone" htmlFor="adminPhone">
              <Input
                id="adminPhone"
                type="tel"
                value={form.adminPhone}
                onChange={(event) => set("adminPhone")(event.target.value)}
                maxLength={40}
              />
            </Field>
            <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
              <Checkbox
                checked={form.autoPipelineEnabled}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    autoPipelineEnabled: Boolean(checked),
                  }))
                }
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium">
                  Automatically triage applications as they arrive
                </span>
                <span className="text-xs leading-5 text-muted-foreground">
                  Eligible applicants scoring 80+ are moved to Shortlisted, 60–79 to Manual
                  Review, and ineligible ones to Rejected. You can turn this off or adjust the
                  thresholds anytime in Settings.
                </span>
              </span>
            </label>
            <Button type="submit" size="lg" disabled={saveWorkspace.isPending}>
              {saveWorkspace.isPending ? "Creating workspace…" : "Create company workspace"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
