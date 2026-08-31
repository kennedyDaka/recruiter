import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addApplicationNote,
  moveApplicationStage,
  scheduleApplicationInterview,
  sendCandidateEmail,
  updateApplicationStatus,
} from "@/lib/recruiter.functions";
import { resendCommunicationFn } from "@/lib/email.functions";
import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DIMENSION_LABELS, type EligibilityGate, type OrsBreakdown } from "@/lib/ors";
import { CircleCheck, CircleX } from "lucide-react";
import { AiExtractionTab } from "@/components/app/AiExtractionTab";

const STATUSES = [
  "started",
  "in_progress",
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

export const Route = createFileRoute("/_authenticated/applications/$applicationId")({
  head: () => ({
    meta: [
      { title: "Applicant review — Operon Recruit" },
      {
        name: "description",
        content:
          "Review a scored applicant: ORS breakdown, work history, documents, pipeline stage, notes and interviews.",
      },
      { property: "og:title", content: "Applicant review — Operon Recruit" },
      {
        property: "og:description",
        content: "ORS score breakdown, work history, pipeline stage, notes and interviews.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplicationDetail,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function normaliseGates(value: unknown): EligibilityGate[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (gate): gate is EligibilityGate =>
      Boolean(
        gate &&
          typeof gate === "object" &&
          typeof (gate as EligibilityGate).name === "string" &&
          typeof (gate as EligibilityGate).passed === "boolean" &&
          typeof (gate as EligibilityGate).reason === "string",
      ),
  );
}

function normaliseReasons(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter((reason): reason is string => typeof reason === "string")
    : [];
}

function normaliseBreakdown(value: unknown): OrsBreakdown[] {
  // score_breakdown is stored as a JSON string (the query builder serializes
  // arrays for TEXT columns), so accept the array, a { breakdown } wrapper, or
  // a JSON-encoded string.
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { breakdown?: unknown }).breakdown)
      ? (parsed as { breakdown: unknown[] }).breakdown
      : [];

  return entries.filter((entry): entry is OrsBreakdown =>
    Boolean(
      entry &&
      typeof entry === "object" &&
      typeof (entry as OrsBreakdown).dimension === "string" &&
      typeof (entry as OrsBreakdown).score === "number" &&
      typeof (entry as OrsBreakdown).max === "number",
    ),
  );
  // Note: zero-max dimensions (the legacy "knowledge" bucket) are filtered at
  // render time so the breakdown only shows live weighted sections.
}

function ApplicationDetail() {
  const { applicationId } = Route.useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [interview, setInterview] = useState({
    scheduled_at: "",
    mode: "In person",
    location: "",
    interviewer: "",
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["application", applicationId] });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["application", applicationId],
    queryFn: async () => {
      const { data: application, error } = await supabase
        .from("applications")
        .select("*, candidates(*), campaigns(id, name, job_title, builder)")
        .eq("id", applicationId)
        .maybeSingle();
      if (error) throw error;
      if (!application) return null;

      // Communications are keyed by the candidate's email or WhatsApp phone
      // (bulk sends don't carry an application_id), so match on both the raw
      // and normalized forms of the contact details.
      const contact = application.candidates as
        | { email?: string | null; phone?: string | null }
        | null;
      const contactEmail = contact?.email?.trim() ?? "";
      const contactPhone = contact?.phone?.trim() ?? "";
      const communicationRecipients = [contactEmail, contactPhone];
      if (contactPhone) {
        const { normalizeWhatsAppPhone } = await import("@/lib/whatsapp-provider");
        const normalized = normalizeWhatsAppPhone(contactPhone);
        if (normalized) communicationRecipients.push(normalized);
      }

      const [
        education,
        experience,
        skills,
        referees,
        documents,
        answers,
        notes,
        interviews,
        history,
        stages,
        communications,
      ] = await Promise.all([
        supabase.from("candidate_education").select("*").eq("application_id", applicationId),
        supabase.from("candidate_experience").select("*").eq("application_id", applicationId),
        supabase.from("candidate_skills").select("*").eq("application_id", applicationId),
        supabase.from("candidate_referees").select("*").eq("application_id", applicationId),
        supabase.from("candidate_documents").select("*").eq("application_id", applicationId),
        supabase.from("candidate_answers").select("*").eq("application_id", applicationId),
        supabase
          .from("notes")
          .select("*")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("interviews")
          .select("*")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("application_stage_history")
          .select("*")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("recruitment_stages")
          .select("id, name, position")
          .eq("campaign_id", application.campaign_id)
          .order("position"),
        supabase
          .from("communications")
          .select("*")
          .in("recipient", communicationRecipients.filter(Boolean))
          .order("created_at", { ascending: false }),
      ]);

      // AI extraction results (best-effort — table may not exist yet)
      let aiResults: any[] = [];
      try {
        const aiRes = await supabase
          .from("ai_jobs" as any)
          .select("id, status, raw_response, parsed_output, attempts, error_code, created_at, completed_at")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(5);
        aiResults = (aiRes.data as any[]) ?? [];
      } catch {
        // ai_jobs table may not exist yet — ignore
      }

      const relatedError = [
        education.error,
        experience.error,
        skills.error,
        referees.error,
        documents.error,
        answers.error,
        notes.error,
        interviews.error,
        history.error,
        stages.error,
        communications.error,
      ].find(Boolean);
      if (relatedError) throw relatedError;

      return {
        application,
        education: education.data ?? [],
        experience: experience.data ?? [],
        skills: skills.data ?? [],
        referees: referees.data ?? [],
        documents: documents.data ?? [],
        answers: answers.data ?? [],
        notes: notes.data ?? [],
        interviews: interviews.data ?? [],
        history: history.data ?? [],
        stages: stages.data ?? [],
        communications: communications.data ?? [],
        aiResults,
      };
    },
  });

  const application = data?.application;
  const candidate = application?.candidates as
    | {
        first_name: string;
        last_name: string;
        email: string;
        phone: string | null;
        location: string | null;
      }
    | null
    | undefined;
  const breakdown = normaliseBreakdown(application?.score_breakdown);
  const gates = normaliseGates(application?.eligibility_reasons);
  const reasons = normaliseReasons(application?.score_reasons);
  // Recency rule the campaign scored with (opt-in in the wizard Scoring step).
  const recencyYears = (() => {
    const builder = (
      application?.campaigns as { builder?: unknown } | null | undefined
    )?.builder;
    if (!builder) return null;
    let parsed: unknown = builder;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed) as unknown;
      } catch {
        return null;
      }
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const raw = (parsed as { experienceRecencyYears?: unknown }).experienceRecencyYears;
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  })();

  const [emailTemplate, setEmailTemplate] = useState("shortlisted");
  const [emailInterview, setEmailInterview] = useState({ scheduled_at: "", mode: "In person", location: "" });

  const moveStage = useServerFn(moveApplicationStage);
  const setStatus = useServerFn(updateApplicationStatus);
  const addNoteFn = useServerFn(addApplicationNote);
  const scheduleInterviewFn = useServerFn(scheduleApplicationInterview);
  const sendEmailFn = useServerFn(sendCandidateEmail);
  const resendEmailFn = useServerFn(resendCommunicationFn);

  const updateStage = useMutation({
    mutationFn: async (stageId: string) => {
      if (!application) return;
      const from = data?.stages.find((s: any) => s.id === application.stage_id)?.name ?? null;
      const to = data?.stages.find((s: any) => s.id === stageId)?.name ?? "Unknown";
      await moveStage({
        data: {
          applicationId,
          tenantId: application.tenant_id,
          stageId,
          fromStage: from,
          toStage: to,
        },
      });
    },
    onSuccess: () => {
      toast.success("Stage updated");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: (typeof STATUSES)[number]) => {
      await setStatus({ data: { applicationId, tenantId: application?.tenant_id ?? "", status } });
    },
    onSuccess: () => {
      toast.success("Status updated");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!application || !note.trim()) return;
      await addNoteFn({
        data: { applicationId, tenantId: application.tenant_id, body: note.trim() },
      });
    },
    onSuccess: () => {
      setNote("");
      toast.success("Note added");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const scheduleInterview = useMutation({
    mutationFn: async () => {
      if (!application) return;
      await scheduleInterviewFn({
        data: {
          applicationId,
          tenantId: application.tenant_id,
          scheduledAt: interview.scheduled_at
            ? new Date(interview.scheduled_at).toISOString()
            : null,
          interviewer: interview.interviewer || null,
          location: interview.location || null,
        },
      });
    },
    onSuccess: () => {
      setInterview({ scheduled_at: "", mode: "In person", location: "", interviewer: "" });
      toast.success("Interview scheduled");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendEmail = useMutation({
    mutationFn: async () => {
      if (!application) return;
      await sendEmailFn({
        data: {
          applicationId,
          tenantId: application.tenant_id,
          template: emailTemplate as
            | "application_received"
            | "shortlisted"
            | "interview_invitation"
            | "rejected"
            | "offer",
          interviewTime: emailTemplate === "interview_invitation"
            ? emailInterview.scheduled_at
              ? new Date(emailInterview.scheduled_at).toISOString()
              : null
            : undefined,
          interviewMode:
            emailTemplate === "interview_invitation" ? emailInterview.mode : undefined,
          interviewLocation:
            emailTemplate === "interview_invitation" ? emailInterview.location || null : undefined,
        },
      });
    },
    onSuccess: () => {
      setEmailInterview({ scheduled_at: "", mode: "In person", location: "" });
      toast.success("Email queued");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resendEmail = useMutation({
    mutationFn: async (id: string) => {
      await resendEmailFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Email re-queued and dispatched");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function openDocument(path: string) {
    const { data: signed, error } = await supabase.storage
      .from("candidate-documents")
      .createSignedUrl(path, 60);
    if (error || !signed) {
      toast.error("Could not open document");
      return;
    }
    window.open(signed.signedUrl, "_blank", "noopener");
  }

  if (isError) {
    return (
      <AppShell title="Applicant" description="">
        <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
          <h2 className="font-display text-lg font-semibold">Could not load this applicant</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The applicant details could not be retrieved. Please try again.
          </p>
          <Button className="mt-5" onClick={() => void refetch()}>
            Try again
          </Button>
          {import.meta.env.DEV && error instanceof Error ? (
            <p className="mt-3 text-xs text-muted-foreground">{error.message}</p>
          ) : null}
        </div>
      </AppShell>
    );
  }

  if (!isLoading && !application) {
    return (
      <AppShell title="Applicant" description="">
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Application not found.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={candidate ? `${candidate.first_name} ${candidate.last_name}` : "Applicant"}
      description={
        application
          ? `${application.reference} · ${(application.campaigns as { job_title?: string } | null)?.job_title ?? ""}`
          : ""
      }
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          <Section title="ORS score">
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <span className="font-display text-5xl font-semibold">{application?.score ?? 0}</span>
              <Badge variant="secondary" className="mb-2">
                {application?.recommendation ?? "Unscored"}
              </Badge>
              <Badge
                variant={application?.eligibility_status === "eligible" ? "default" : "destructive"}
                className="mb-2"
              >
                {application?.eligibility_status === "eligible" ? "Eligible" : "Not eligible"}
              </Badge>
              {recencyYears ? (
                <Badge variant="outline" className="mb-2">
                  Recency: last {recencyYears} years
                </Badge>
              ) : null}
            </div>

            {gates.length > 0 ? (
              <div className="mb-5 grid gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Eligibility gates
                </p>
                {gates.map((gate) => (
                  <div key={gate.name} className="flex items-start gap-2 text-sm">
                    {gate.passed ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
                    )}
                    <span>
                      <span className="font-medium">{gate.name}:</span>{" "}
                      <span className="text-muted-foreground">{gate.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3">
              {breakdown
                .filter((item) => item.max > 0)
                .map((item) => (
                  <div key={item.dimension}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{item.label ?? DIMENSION_LABELS[item.dimension]}</span>
                      <span className="text-muted-foreground">
                        {item.score}/{item.max}
                      </span>
                    </div>
                    <Progress value={(item.score / item.max) * 100} />
                  </div>
                ))}
              {breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No score breakdown recorded.</p>
              ) : null}
            </div>

            {reasons.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Why this score
                </p>
                <ul className="grid gap-1.5 text-sm">
                  {reasons.map((reason, index) => (
                    <li key={`${index}-${reason}`} className="flex items-start gap-2">
                      <span
                        className={reason.startsWith("\u2713")
                          ? "text-emerald-600"
                          : reason.startsWith("\u25b3")
                            ? "text-amber-600"
                            : "text-muted-foreground"}
                      >
                        {reason.startsWith("\u2713")
                          ? "\u2713"
                          : reason.startsWith("\u25b3")
                            ? "\u25b3"
                            : "•"}
                      </span>
                      <span>{reason.replace(/^[✓△]\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="answers">Answers</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="interviews">Interviews</TabsTrigger>
              <TabsTrigger value="emails">Emails</TabsTrigger>
              {(data?.aiResults?.length ?? 0) > 0 && (
                <TabsTrigger value="ai" className="gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                  AI Extraction
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="profile" className="mt-4 grid gap-6">
              <Section title="Contact">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd>{candidate?.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{candidate?.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Location</dt>
                    <dd>{candidate?.location ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Experience</dt>
                    <dd>{application?.years_experience ?? 0} years</dd>
                  </div>
                </dl>
              </Section>

              <Section title="Education">
                <div className="grid gap-3 text-sm">
                  {(data?.education ?? []).map((row: any) => (
                    <div key={row.id}>
                      <p className="font-medium">
                        {row.qualification}
                        {row.field_of_study ? ` — ${row.field_of_study}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.institution ?? "—"} · {row.end_year ?? "in progress"}
                      </p>
                    </div>
                  ))}
                  {(data?.education ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No education recorded.</p>
                  ) : null}
                </div>
              </Section>

              <Section title="Work history">
                <div className="grid gap-3 text-sm">
                  {(data?.experience ?? []).map((row: any) => (
                    <div key={row.id}>
                      <p className="font-medium">
                        {row.position} · {row.employer}
                        {row.field ? (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">
                            {row.field}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.start_date ?? "—"} →{" "}
                        {row.is_current ? "Present" : (row.end_date ?? "—")}
                      </p>
                      {row.responsibilities ? (
                        <p className="mt-1 text-muted-foreground">{row.responsibilities}</p>
                      ) : null}
                    </div>
                  ))}
                  {(data?.experience ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No work history recorded.</p>
                  ) : null}
                </div>
              </Section>

              <Section title="Skills">
                <div className="flex flex-wrap gap-2">
                  {(data?.skills ?? []).map((row: any) => (
                    <Badge key={row.id} variant="secondary">
                      {row.skill}
                    </Badge>
                  ))}
                  {(data?.skills ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No skills recorded.</p>
                  ) : null}
                </div>
              </Section>

              <Section title="Referees">
                <div className="grid gap-3 text-sm">
                  {(data?.referees ?? []).map((row: any) => (
                    <div key={row.id}>
                      <p className="font-medium">
                        {row.name}
                        {row.position ? ` — ${row.position}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.organisation ?? "—"} · {row.email ?? row.phone ?? "—"}
                      </p>
                    </div>
                  ))}
                  {(data?.referees ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No referees provided.</p>
                  ) : null}
                </div>
              </Section>

              <Section title="Documents">
                <div className="grid gap-2 text-sm">
                  {(data?.documents ?? []).map((row: any) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => void openDocument(row.file_path)}
                      className="text-left text-primary hover:underline"
                    >
                      {row.doc_type}: {row.file_name}
                    </button>
                  ))}
                  {(data?.documents ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No documents uploaded.</p>
                  ) : null}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="answers" className="mt-4">
              <Section title="Screening answers">
                <div className="grid gap-4 text-sm">
                  {(data?.answers ?? []).map((row: any) => (
                    <div key={row.id}>
                      <p className="font-medium">{row.question_text}</p>
                      <p className="text-muted-foreground">{row.answer ?? "—"}</p>
                    </div>
                  ))}
                  {(data?.answers ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No screening questions answered.</p>
                  ) : null}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <Section title="Internal notes">
                <div className="mb-4 grid gap-2">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add an internal note about this applicant…"
                    rows={3}
                  />
                  <div>
                    <Button
                      onClick={() => addNote.mutate()}
                      disabled={!note.trim() || addNote.isPending}
                    >
                      Add note
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 text-sm">
                  {(data?.notes ?? []).map((row: any) => (
                    <div key={row.id} className="rounded-lg border border-border p-3">
                      <p>{row.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {(data?.notes ?? []).length === 0 ? (
                    <p className="text-muted-foreground">No notes yet.</p>
                  ) : null}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="interviews" className="mt-4">
              <Section title="Schedule an interview">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="scheduled_at">Date &amp; time</Label>
                    <Input
                      id="scheduled_at"
                      type="datetime-local"
                      value={interview.scheduled_at}
                      onChange={(event) =>
                        setInterview((prev) => ({ ...prev, scheduled_at: event.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="mode">Mode</Label>
                    <Select
                      value={interview.mode}
                      onValueChange={(value) => setInterview((prev) => ({ ...prev, mode: value }))}
                    >
                      <SelectTrigger id="mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="In person">In person</SelectItem>
                        <SelectItem value="Video call">Video call</SelectItem>
                        <SelectItem value="Phone">Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="location">Location / link</Label>
                    <Input
                      id="location"
                      value={interview.location}
                      onChange={(event) =>
                        setInterview((prev) => ({ ...prev, location: event.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="interviewer">Interviewer</Label>
                    <Input
                      id="interviewer"
                      value={interview.interviewer}
                      onChange={(event) =>
                        setInterview((prev) => ({ ...prev, interviewer: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <Button
                  className="mt-4"
                  onClick={() => scheduleInterview.mutate()}
                  disabled={!interview.scheduled_at || scheduleInterview.isPending}
                >
                  Schedule interview
                </Button>
              </Section>

              <div className="mt-6">
                <Section title="Scheduled interviews">
                  <div className="grid gap-3 text-sm">
                    {(data?.interviews ?? []).map((row: any) => (
                      <div key={row.id} className="rounded-lg border border-border p-3">
                        <p className="font-medium">
                          {row.scheduled_at
                            ? new Date(row.scheduled_at).toLocaleString()
                            : "Unscheduled"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.mode ?? "—"} · {row.location ?? "—"} · {row.interviewer ?? "—"} ·{" "}
                          {row.status}
                        </p>
                      </div>
                    ))}
                    {(data?.interviews ?? []).length === 0 ? (
                      <p className="text-muted-foreground">No interviews scheduled.</p>
                    ) : null}
                  </div>
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="emails" className="mt-4">
              <Section title="Send an email">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="email-template">Template</Label>
                    <Select value={emailTemplate} onValueChange={setEmailTemplate}>
                      <SelectTrigger id="email-template">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="application_received">
                          Application received
                        </SelectItem>
                        <SelectItem value="shortlisted">Shortlisted</SelectItem>
                        <SelectItem value="interview_invitation">Interview invitation</SelectItem>
                        <SelectItem value="offer">Offer</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {emailTemplate === "interview_invitation" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label htmlFor="email-interview-time">Interview date &amp; time</Label>
                        <Input
                          id="email-interview-time"
                          type="datetime-local"
                          value={emailInterview.scheduled_at}
                          onChange={(event) =>
                            setEmailInterview((prev) => ({
                              ...prev,
                              scheduled_at: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="email-interview-mode">Mode</Label>
                        <Select
                          value={emailInterview.mode}
                          onValueChange={(value) =>
                            setEmailInterview((prev) => ({ ...prev, mode: value }))
                          }
                        >
                          <SelectTrigger id="email-interview-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="In person">In person</SelectItem>
                            <SelectItem value="Video call">Video call</SelectItem>
                            <SelectItem value="Phone">Phone</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="email-interview-location">Location / link</Label>
                        <Input
                          id="email-interview-location"
                          value={emailInterview.location}
                          onChange={(event) =>
                            setEmailInterview((prev) => ({
                              ...prev,
                              location: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </div>
                <Button
                  className="mt-4"
                  onClick={() => sendEmail.mutate()}
                  disabled={sendEmail.isPending}
                >
                  {sendEmail.isPending ? "Queuing…" : "Queue email"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Emails are queued and delivered by the mail worker. Configure SMTP credentials
                  to send immediately.
                </p>
              </Section>

              <div className="mt-6">
                <Section title="Email timeline">
                  {(data?.communications ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No emails sent to this candidate yet.
                    </p>
                  ) : (
                    <ol className="relative ml-1.5 border-l border-border pl-6">
                      {(data?.communications ?? []).map((row: any) => {
                        const status = row.status as string;
                        const dotColor =
                          status === "sent"
                            ? "bg-emerald-500"
                            : status === "failed"
                              ? "bg-rose-500"
                              : "bg-amber-400";
                        return (
                          <li key={row.id} className="relative pb-6 last:pb-0">
                            <span
                              className={`absolute -left-[31px] top-1.5 size-3 rounded-full border-2 border-background ${dotColor}`}
                            />
                            <div className="rounded-lg border border-border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">
                                  {row.template?.replace(/_/g, " ") ?? "Email"}
                                </p>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={
                                      status === "sent"
                                        ? "secondary"
                                        : status === "failed"
                                          ? "destructive"
                                          : "outline"
                                    }
                                  >
                                    {status}
                                  </Badge>
                                  {status === "failed" || status === "queued" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={resendEmail.isPending}
                                      onClick={() => resendEmail.mutate(row.id)}
                                    >
                                      {resendEmail.isPending ? "Sending…" : "Resend"}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              <p className="mt-1 text-xs font-medium">{row.subject}</p>
                              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                                {row.body}
                              </p>
                              {status === "failed" && row.error ? (
                                <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
                                  {row.error}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs text-muted-foreground">
                                To: {row.recipient ?? "—"} ·{" "}
                                {row.sent_at
                                  ? `Sent ${new Date(row.sent_at).toLocaleString()}`
                                  : `Queued ${new Date(row.created_at).toLocaleString()}`}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <AiExtractionTab aiResults={data?.aiResults ?? []} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Pipeline">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Stage</Label>
                <Select
                  {...(application?.stage_id ? { value: application.stage_id } : {})}
                  onValueChange={(value) => updateStage.mutate(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.stages ?? []).map((stage: any) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  {...(application?.status ? { value: application.status } : {})}
                  onValueChange={(value) => updateStatus.mutate(value as (typeof STATUSES)[number])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {application?.campaign_id ? (
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: application.campaign_id }}
                  className="text-sm text-primary hover:underline"
                >
                  Back to campaign pipeline
                </Link>
              ) : null}
            </div>
          </Section>

          <Section title="Stage history">
            <div className="grid gap-3 text-sm">
              {(data?.history ?? []).map((row: any) => (
                <div key={row.id}>
                  <p>
                    {row.from_stage ?? "—"} → <span className="font-medium">{row.to_stage}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              {(data?.history ?? []).length === 0 ? (
                <p className="text-muted-foreground">No stage moves yet.</p>
              ) : null}
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
