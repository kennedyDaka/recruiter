import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Globe2, Mail, MessageCircle, RotateCcw, Send, Zap } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getTenantSettings,
  updateTenantSettings,
} from "@/lib/settings.functions";
import {
  flushEmails,
  getEmailStatus,
  getWhatsAppStatus,
  sendTestEmail,
} from "@/lib/email.functions";
import {
  DEFAULT_EMAIL_TEMPLATES,
  type EmailTemplateKey,
} from "@/lib/email-templates";

// Templates a recruiter can edit in Settings. The account-level
// `password_reset` template is env-only (no tenant session when it sends).
type EditableTemplateKey = Exclude<EmailTemplateKey, "password_reset">;
import type { DistributionSettings } from "@/lib/tenant-settings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Operon Recruit" },
      {
        name: "description",
        content: "Manage your workspace settings, automation rules and email integration.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getTenantSettings);
  const saveSettings = useServerFn(updateTenantSettings);
  const getStatus = useServerFn(getEmailStatus);
  const getWaStatus = useServerFn(getWhatsAppStatus);
  const flush = useServerFn(flushEmails);
  const testEmail = useServerFn(sendTestEmail);

  const settingsQuery = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: async () => {
      const result = (await getSettings()) as {
        autoPipeline: { enabled: boolean; shortlistMin: number; reviewMin: number };
        email: {
          from: string;
          fromName: string;
          verifyEmails: boolean;
        };
        emailTemplates: Record<string, { subject: string; body: string } | null>;
        whatsapp: { enabled: boolean };
        distribution: DistributionSettings;
      };
      return result;
    },
  });

  const whatsappStatusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: async () =>
      (await getWaStatus()) as { configured: boolean; status: string },
  });

  const emailStatusQuery = useQuery({
    queryKey: ["email-status"],
    queryFn: async () =>
      (await getStatus()) as {
        mode: string;
        configured: boolean;
        status: string;
        warning: { type: "unverified_domain"; domain: string; message: string } | null;
      },
  });

  const [enabled, setEnabled] = useState(false);
  const [shortlistMin, setShortlistMin] = useState(80);
  const [reviewMin, setReviewMin] = useState(60);

  const [email, setEmail] = useState({
    from: "",
    fromName: "",
    verifyEmails: true,
  });
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [dirty, setDirty] = useState(false);
  const [templates, setTemplates] = useState<
    Record<EditableTemplateKey, { subject: string; body: string } | null>
  >({
    application_received: null,
    shortlisted: null,
    interview_invitation: null,
    rejected: null,
    offer: null,
    email_verification: null,
  });
  const [distribution, setDistribution] = useState<DistributionSettings>({
    googleJobs: true,
    jobFeed: true,
    linkedin: false,
  });

  useEffect(() => {
    const auto = settingsQuery.data?.autoPipeline;
    const savedEmail = settingsQuery.data?.email;
    const savedTemplates = settingsQuery.data?.emailTemplates;
    const savedWhatsApp = settingsQuery.data?.whatsapp;
    const savedDistribution = settingsQuery.data?.distribution;
    if (!auto) return;
    setEnabled(auto.enabled);
    setShortlistMin(auto.shortlistMin);
    setReviewMin(auto.reviewMin);
    if (savedEmail) setEmail(savedEmail);
    if (savedWhatsApp) setWhatsappEnabled(savedWhatsApp.enabled);
    setTemplates((current) =>
      Object.fromEntries(
        (Object.keys(current) as EditableTemplateKey[]).map((key) => [
          key,
          savedTemplates?.[key] ?? null,
        ]),
      ) as Record<EditableTemplateKey, { subject: string; body: string } | null>,
    );
    if (savedDistribution)
      setDistribution((current) => ({ ...current, ...savedDistribution }));
    setDirty(false);
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      await saveSettings({
        data: {
          autoPipeline: { enabled, shortlistMin, reviewMin },
          email: { ...email },
          emailTemplates: templates,
          whatsapp: { enabled: whatsappEnabled },
          distribution,
        },
      });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
      queryClient.invalidateQueries({ queryKey: ["email-status"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const flushEmailsMutation = useMutation({
    mutationFn: async () => {
      const result = (await flush()) as { sent: number; failed: number };
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        result.sent > 0
          ? `${result.sent} email${result.sent === 1 ? "" : "s"} sent` +
              (result.failed > 0 ? `, ${result.failed} failed` : "")
          : "No queued emails to send",
      );
      queryClient.invalidateQueries({ queryKey: ["email-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      if (!testTo.trim()) throw new Error("Enter an email address to send the test to.");
      const result = (await testEmail({ data: { to: testTo.trim() } })) as {
        messageId?: string;
        provider: string;
      };
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        result.provider === "log"
          ? "Test email recorded (log mode — no provider configured)"
          : `Test email sent via ${result.provider}`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patchEmail = (patch: Partial<typeof email>) => {
    setEmail((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  return (
    <AppShell
      title="Settings"
      description="Workspace configuration, automation rules and email integration."
    >
      <div className="max-w-3xl space-y-6">
        {/* ── Auto-pipeline ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-semibold">
                    Automatic pipeline triage
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    When enabled, new applications are routed automatically as
                    they are scored: eligible applicants scoring{" "}
                    {shortlistMin}+ go straight to <strong>Shortlisted</strong>,
                    {reviewMin}–{shortlistMin - 1} to{" "}
                    <strong>Manual Review</strong>, and ineligible applicants to{" "}
                    <strong>Rejected</strong>. Off by default — nothing moves
                    without you choosing automation.
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(value) => {
                    setEnabled(value);
                    setDirty(true);
                  }}
                />
              </div>
            </div>
          </div>

          {enabled ? (
            <div className="mt-6 grid gap-4 rounded-lg border border-border bg-secondary/30 p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="shortlistMin">Shortlist threshold (score)</Label>
                <Input
                  id="shortlistMin"
                  type="number"
                  min={1}
                  max={100}
                  value={shortlistMin}
                  onChange={(e) => {
                    setShortlistMin(Number(e.target.value) || 0);
                    setDirty(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Eligible candidates at or above this score are shortlisted.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reviewMin">Manual review threshold (score)</Label>
                <Input
                  id="reviewMin"
                  type="number"
                  min={1}
                  max={100}
                  value={reviewMin}
                  onChange={(e) => {
                    setReviewMin(Number(e.target.value) || 0);
                    setDirty(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Eligible candidates below shortlist but at or above this score
                  go to Manual Review.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Email integration ─────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Mail className="size-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-base font-semibold">
                Email integration
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Emails are sent automatically through the platform provider — no
                SMTP or API setup needed. You can set the from address and name
                used on your company's emails below.
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Status:{" "}
                <span
                  className={
                    emailStatusQuery.data?.configured
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                >
                  {emailStatusQuery.data?.status ?? "Checking…"}
                </span>
              </p>
            </div>
          </div>

          {emailStatusQuery.data?.warning ? (
            <div className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Sending domain not verified — emails are failing</p>
              <p className="mt-1 leading-6">{emailStatusQuery.data.warning.message}</p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emailFrom">From address (optional)</Label>
              <Input
                id="emailFrom"
                type="email"
                placeholder="noreply@yourcompany.com"
                value={email.from}
                onChange={(e) => patchEmail({ from: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the platform's default sending address. The
                domain must be verified in the platform before it can send.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emailFromName">From name (optional)</Label>
              <Input
                id="emailFromName"
                placeholder="ACME Recruitment"
                value={email.fromName}
                onChange={(e) => patchEmail({ fromName: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Verify candidate email addresses automatically</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every application and bulk-send recipient is checked for format,
                  disposable domains and mail-server records, plus a deep
                  deliverability check when the platform has it enabled. Invalid
                  addresses are blocked or flagged without you doing anything.
                </p>
              </div>
              <Switch
                checked={email.verifyEmails}
                onCheckedChange={(value) => {
                  patchEmail({ verifyEmails: value });
                }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button
              variant="outline"
              onClick={() => flushEmailsMutation.mutate()}
              disabled={flushEmailsMutation.isPending}
            >
              <Send className="size-4" />
              {flushEmailsMutation.isPending ? "Sending…" : "Send queued emails"}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/30 p-4">
            <div className="grid min-w-52 flex-1 gap-2">
              <Label htmlFor="testTo">Test email to</Label>
              <Input
                id="testTo"
                type="email"
                placeholder="you@example.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => sendTest.mutate()}
              disabled={sendTest.isPending}
            >
              {sendTest.isPending ? "Sending…" : "Send test email"}
            </Button>
          </div>
        </section>

        {/* ── WhatsApp messaging ──────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MessageCircle className="size-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-base font-semibold">
                WhatsApp messaging
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                When enabled, candidates who don't provide an email address
                receive the same automated messages (application received,
                shortlisted, interview, offer, rejection) over WhatsApp instead
                of being skipped. Email stays the default — WhatsApp is only
                used as the phone-number fallback.
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Status:{" "}
                <span
                  className={
                    whatsappStatusQuery.data?.configured
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                >
                  {whatsappStatusQuery.data?.status ?? "Checking…"}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  Send WhatsApp messages to candidates without an email
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sending runs through the platform's WhatsApp Cloud API
                  connection (Meta) — no per-message setup on your side. Phone
                  numbers are normalised to international format automatically.
                </p>
              </div>
              <Switch
                checked={whatsappEnabled}
                onCheckedChange={(value) => {
                  setWhatsappEnabled(value);
                  setDirty(true);
                }}
              />
            </div>
          </div>

          <div className="mt-4 flex">
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </section>

        {/* ── Email templates ─────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="size-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-base font-semibold">
                Email templates
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The automatic emails below use the platform defaults unless you
                customise them here. Placeholders like{" "}
                <code className="rounded bg-secondary px-1 py-0.5 text-xs">{"{{first_name}}"}</code>{" "}
                are filled in per candidate. Reset a template to go back to the
                default wording.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {(
              [
                ["application_received", "Application received"],
                ["shortlisted", "Shortlisted"],
                ["interview_invitation", "Interview invitation"],
                ["rejected", "Rejected"],
                ["offer", "Job offer"],
              ] as [EditableTemplateKey, string][]
            ).map(([key, label]) => {
              const effective = templates[key] ?? DEFAULT_EMAIL_TEMPLATES[key];
              const isCustom = templates[key] !== null;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border/80 bg-secondary/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {label}
                      {isCustom ? (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Customised
                        </span>
                      ) : null}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTemplates((current) => ({ ...current, [key]: null }));
                        setDirty(true);
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      Reset to default
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`tpl-subject-${key}`} className="text-xs">
                        Subject
                      </Label>
                      <Input
                        id={`tpl-subject-${key}`}
                        value={effective.subject}
                        onChange={(e) => {
                          setTemplates((current) => ({
                            ...current,
                            [key]: {
                              subject: e.target.value,
                              body: current[key]?.body ?? DEFAULT_EMAIL_TEMPLATES[key].body,
                            },
                          }));
                          setDirty(true);
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`tpl-body-${key}`} className="text-xs">
                        Body
                      </Label>
                      <Textarea
                        id={`tpl-body-${key}`}
                        rows={6}
                        value={effective.body}
                        onChange={(e) => {
                          setTemplates((current) => ({
                            ...current,
                            [key]: {
                              subject: current[key]?.subject ?? DEFAULT_EMAIL_TEMPLATES[key].subject,
                              body: e.target.value,
                            },
                          }));
                          setDirty(true);
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Available variables:{" "}
            <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>,{" "}
            <code>{"{{job_title}}"}</code>, <code>{"{{company}}"}</code>,{" "}
            <code>{"{{reference}}"}</code>, <code>{"{{interview_time}}"}</code>,{" "}
            <code>{"{{interview_mode}}"}</code>, <code>{"{{interview_location}}"}</code>.
          </p>
        </section>

        {/* ── Job distribution ────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Globe2 className="size-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-base font-semibold">
                Job distribution
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                When a campaign is published it is distributed through the
                channels below. Google Jobs and the job feed work automatically
                with no extra setup.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-secondary/30 p-4">
              <div>
                <p className="text-sm font-semibold">Google Jobs</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Each published role carries Google-recognised structured data
                  (JobPosting schema), so jobs appear in Google for Jobs search
                  results. Free and automatic once indexed.
                </p>
              </div>
              <Switch
                checked={distribution.googleJobs}
                onCheckedChange={(value) => {
                  setDistribution((current) => ({ ...current, googleJobs: value }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-secondary/30 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Job feed (Indeed &amp; aggregators)</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  A public XML feed of your live roles at{" "}
                  <code className="break-all rounded bg-secondary px-1 py-0.5 text-xs">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/feeds/jobs.xml`
                      : "/feeds/jobs.xml"}
                  </code>
                  . Submit that URL to Indeed / Workable / aggregators to pull
                  jobs in automatically.
                </p>
              </div>
              <Switch
                checked={distribution.jobFeed}
                onCheckedChange={(value) => {
                  setDistribution((current) => ({ ...current, jobFeed: value }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-secondary/30 p-4 opacity-80">
              <div>
                <p className="text-sm font-semibold">LinkedIn</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Posting to LinkedIn requires an approved LinkedIn partner API
                  (job wrapping) — there is no open public endpoint. The moment
                  you have partner credentials, this switch activates and your
                  roles post on publish.
                </p>
              </div>
              <Switch checked={false} disabled aria-disabled />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
