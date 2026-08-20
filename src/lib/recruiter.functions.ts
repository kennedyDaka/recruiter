import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  renderEmail,
  resolveEmailTemplate,
  type EmailTemplateKey,
  type EmailVars,
} from "@/lib/email-templates";

const applicationRefSchema = z.object({
  applicationId: z.string().min(1),
  // Kept for API compatibility, but never trusted: the tenant comes from the
  // authenticated session (context.tenantId, DB-resolved) and every mutation
  // is additionally verified against the row's own tenant_id.
  tenantId: z.string().min(1),
});

/** Stages that automatically trigger a candidate email when entered. */
const STAGE_EMAIL_MAP: Record<string, EmailTemplateKey> = {
  shortlisted: "shortlisted",
  interview: "interview_invitation",
  rejected: "rejected",
  hired: "offer",
};

type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Verifies an application exists AND belongs to the caller's tenant before
 * any mutation. The context.supabase builder is already tenant-scoped, so a
 * cross-tenant id resolves to "not found" here — this is the explicit guard
 * on top of the DB-level WHERE injection.
 */
async function assertOwnedApplication(
  supabase: SupabaseLike,
  applicationId: string,
  tenantId: string,
): Promise<void> {
  const res = await supabase
    .from("applications")
    .select("tenant_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.tenant_id !== tenantId) {
    throw new Error("Application not found.");
  }
}

/**
 * Renders a template from the application's real data and queues it on the
 * right channel: email when the candidate has an address, otherwise WhatsApp
 * (phone) when the workspace has WhatsApp enabled — so a candidate with no
 * email is still notified instead of being silently skipped.
 *
 * Returns the channel that was used ("email" | "whatsapp") or "none" when
 * there is no reachable contact.
 */
async function enqueueStatusEmail(
  supabase: SupabaseLike,
  args: {
    applicationId: string;
    tenantId: string;
    template: EmailTemplateKey;
    vars?: Partial<EmailVars>;
  },
): Promise<"email" | "whatsapp" | "none"> {
  const appRes = await supabase
    .from("applications")
    .select("id, reference, candidates(email, phone, first_name, last_name), campaigns(job_title)")
    .eq("id", args.applicationId)
    .maybeSingle();
  if (appRes.error) throw new Error(appRes.error.message);
  const application = appRes.data;
  if (!application) return "none";

  const candidate = application.candidates as
    | {
        email: string | null;
        phone: string | null;
        first_name: string;
        last_name: string | null;
      }
    | null;
  const campaign = application.campaigns as { job_title?: string | null } | null;
  if (!candidate) return "none";

  // The company name and any recruiter-customised templates come from the
  // tenant — a separate lookup keeps the query builder's simple joins.
  const tenantRes = await supabase
    .from("tenants")
    .select("name, settings")
    .eq("id", args.tenantId)
    .maybeSingle();

  // The tenant's template overrides win when set; otherwise the platform
  // defaults render. Recruiters edit these on the Settings page.
  const { parseTenantSettings } = await import("@/lib/tenant-settings");
  const settings = parseTenantSettings(
    (tenantRes.data as { settings?: unknown } | null)?.settings,
  );
  const source = resolveEmailTemplate(args.template, settings.emailTemplates);
  const rendered = renderEmail(source, {
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    job_title: campaign?.job_title ?? null,
    company: (tenantRes.data?.name as string | undefined) ?? null,
    reference: application.reference,
    ...args.vars,
  });

  // Channel selection: email first, WhatsApp (phone) as the fallback when the
  // candidate has no email and the workspace opted in.
  let channel: "email" | "whatsapp" | "none" = "none";
  let recipient = "";
  if (candidate.email) {
    channel = "email";
    recipient = candidate.email;
  } else if (settings.whatsapp.enabled && candidate.phone) {
    const { normalizeWhatsAppPhone } = await import("@/lib/whatsapp-provider");
    const phone = normalizeWhatsAppPhone(candidate.phone);
    if (phone) {
      channel = "whatsapp";
      recipient = phone;
    }
  }
  if (channel === "none" || !recipient) return "none";

  const inserted = await supabase.from("communications").insert({
    tenant_id: args.tenantId,
    application_id: args.applicationId,
    channel,
    template: args.template,
    subject: channel === "email" ? rendered.subject : null,
    body: rendered.body,
    recipient,
    status: "queued",
  });
  if (inserted.error) throw new Error(inserted.error.message);

  // Best-effort immediate dispatch so automated messages go out right away;
  // on failure the row stays queued for the worker / manual flush.
  try {
    const { flushQueuedCommunications } = await import("@/lib/email-dispatch");
    await flushQueuedCommunications(supabase, args.tenantId);
  } catch {
    // Non-fatal.
  }
  return channel;
}

/** Moves an application to another stage and records the pipeline move. */
export const moveApplicationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    applicationRefSchema.extend({
      stageId: z.string().min(1),
      fromStage: z.string().nullable(),
      toStage: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    await assertOwnedApplication(supabase, data.applicationId, tenantId);

    const updated = await supabase
      .from("applications")
      .update({ stage_id: data.stageId })
      .eq("id", data.applicationId);
    if (updated.error) throw new Error(updated.error.message);

    const history = await supabase.from("application_stage_history").insert({
      tenant_id: tenantId,
      application_id: data.applicationId,
      from_stage: data.fromStage,
      to_stage: data.toStage,
      changed_by: context.userId,
    });
    if (history.error) throw new Error(history.error.message);

    // Automated mail for pipeline decisions (shortlist, interview, reject, offer).
    const template = STAGE_EMAIL_MAP[data.toStage.toLowerCase()];
    if (template) {
      try {
        await enqueueStatusEmail(supabase, {
          applicationId: data.applicationId,
          tenantId,
          template,
        });
      } catch {
        // A failed automated email must never break the pipeline move.
      }
    }

    return { ok: true };
  });

/** Updates the application status (e.g. to "interview" or "rejected"). */
export const updateApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(applicationRefSchema.extend({ status: z.string().min(1).max(60) }))
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    await assertOwnedApplication(context.supabase, data.applicationId, tenantId);

    const updated = await context.supabase
      .from("applications")
      .update({ status: data.status })
      .eq("id", data.applicationId);
    if (updated.error) throw new Error(updated.error.message);

    const template = STAGE_EMAIL_MAP[data.status.toLowerCase()];
    if (template) {
      try {
        await enqueueStatusEmail(context.supabase, {
          applicationId: data.applicationId,
          tenantId,
          template,
        });
      } catch {
        // Non-fatal.
      }
    }
    return { ok: true };
  });

/** Adds a recruiter note to an application. */
export const addApplicationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(applicationRefSchema.extend({ body: z.string().trim().min(1).max(3000) }))
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    await assertOwnedApplication(context.supabase, data.applicationId, tenantId);

    const inserted = await context.supabase.from("notes").insert({
      tenant_id: tenantId,
      application_id: data.applicationId,
      author_id: context.userId,
      body: data.body,
    });
    if (inserted.error) throw new Error(inserted.error.message);
    return { ok: true };
  });

/** Schedules an interview for an application, marks it in interview and emails the invitation. */
export const scheduleApplicationInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    applicationRefSchema.extend({
      scheduledAt: z.string().nullable(),
      interviewer: z.string().max(120).nullable(),
      location: z.string().max(200).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    await assertOwnedApplication(supabase, data.applicationId, tenantId);

    const inserted = await supabase.from("interviews").insert({
      tenant_id: tenantId,
      application_id: data.applicationId,
      scheduled_at: data.scheduledAt,
      interviewer: data.interviewer,
      location: data.location,
      status: "scheduled",
    });
    if (inserted.error) throw new Error(inserted.error.message);

    const updated = await supabase
      .from("applications")
      .update({ status: "interview" })
      .eq("id", data.applicationId);
    if (updated.error) throw new Error(updated.error.message);

    try {
      await enqueueStatusEmail(supabase, {
        applicationId: data.applicationId,
        tenantId: data.tenantId,
        template: "interview_invitation",
        vars: {
          interview_time: data.scheduledAt,
          interview_location: data.location,
        },
      });
    } catch {
      // Non-fatal.
    }

    return { ok: true };
  });

/** Sends a candidate email from a template (recruiter-initiated). */
export const sendCandidateEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    applicationRefSchema.extend({
      template: z.enum([
        "application_received",
        "shortlisted",
        "interview_invitation",
        "rejected",
        "offer",
      ]),
      interviewTime: z.string().nullable().optional(),
      interviewMode: z.string().max(120).nullable().optional(),
      interviewLocation: z.string().max(200).nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    await assertOwnedApplication(context.supabase, data.applicationId, tenantId);

    // Verify the recipient before queueing a manual send: when the tenant has
    // verification on, an invalid/spamtrap address is refused loudly instead
    // of silently burning a send (and hurting deliverability).
    const appRes = await context.supabase
      .from("applications")
      .select("candidates(email)")
      .eq("id", data.applicationId)
      .maybeSingle();
    const recipient = (appRes.data as { candidates?: { email?: string } } | null)
      ?.candidates?.email;
    if (recipient) {
      const tenantRes = await context.supabase
        .from("tenants")
        .select("settings")
        .eq("id", tenantId)
        .maybeSingle();
      if (!tenantRes.error) {
        const { parseTenantSettings } = await import("@/lib/tenant-settings");
        const tenantSettings = parseTenantSettings(
          (tenantRes.data as { settings?: unknown } | null)?.settings,
        );
        if (tenantSettings.email.verifyEmails !== false) {
          const { assertEmailUsable } = await import("@/lib/email-verify");
          await assertEmailUsable(recipient, {
            zeroBounceKey: process.env["ZEROBOUNCE_API_KEY"] || null,
          });
        }
      }
    }

    const channel = await enqueueStatusEmail(context.supabase, {
      applicationId: data.applicationId,
      tenantId,
      template: data.template,
      vars: {
        interview_time: data.interviewTime ?? null,
        interview_mode: data.interviewMode ?? null,
        interview_location: data.interviewLocation ?? null,
      },
    });
    if (channel === "none") {
      throw new Error("This candidate has no email or WhatsApp number on file.");
    }
    return { ok: true, channel };
  });

/** Moves several applications to a stage in one action, with history rows. */
export const bulkMoveApplicationsStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      tenantId: z.string().min(1),
      applicationIds: z.array(z.string().min(1)).min(1).max(200),
      stageId: z.string().min(1),
      fromStageNames: z.record(z.string(), z.string().nullable()),
      toStageName: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    // Verify every id belongs to this tenant before touching anything, so a
    // mixed list can never mutate another tenant's applications.
    const owned = await supabase
      .from("applications")
      .select("id")
      .in("id", data.applicationIds);
    if (owned.error) throw new Error(owned.error.message);
    const ownedIds = new Set((owned.data ?? []).map((row: any) => row.id as string));
    const foreign = data.applicationIds.filter((id) => !ownedIds.has(id));
    if (foreign.length) throw new Error("One or more applications were not found.");

    const updated = await supabase
      .from("applications")
      .update({ stage_id: data.stageId })
      .in("id", data.applicationIds);
    if (updated.error) throw new Error(updated.error.message);

    const history = await supabase.from("application_stage_history").insert(
      data.applicationIds.map((applicationId) => ({
        tenant_id: tenantId,
        application_id: applicationId,
        from_stage: data.fromStageNames[applicationId] ?? null,
        to_stage: data.toStageName,
        changed_by: context.userId,
      })),
    );
    if (history.error) throw new Error(history.error.message);

    // Queue the automated email once per affected candidate.
    const template = STAGE_EMAIL_MAP[data.toStageName.toLowerCase()];
    if (template) {
      for (const applicationId of data.applicationIds) {
        try {
          await enqueueStatusEmail(supabase, {
            applicationId,
            tenantId,
            template,
          });
        } catch {
          // Non-fatal per recipient.
        }
      }
    }

    return { ok: true, count: data.applicationIds.length };
  });

/** Bulk-updates application statuses (shortlist / reject / offer…). */
export const bulkSetApplicationsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      tenantId: z.string().min(1),
      applicationIds: z.array(z.string().min(1)).min(1).max(200),
      status: z.string().min(1).max(60),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    // Verify every id belongs to this tenant before mutating anything.
    const owned = await supabase
      .from("applications")
      .select("id")
      .in("id", data.applicationIds);
    if (owned.error) throw new Error(owned.error.message);
    const ownedIds = new Set((owned.data ?? []).map((row: any) => row.id as string));
    const foreign = data.applicationIds.filter((id) => !ownedIds.has(id));
    if (foreign.length) throw new Error("One or more applications were not found.");

    const updated = await supabase
      .from("applications")
      .update({ status: data.status })
      .in("id", data.applicationIds);
    if (updated.error) throw new Error(updated.error.message);

    const template = STAGE_EMAIL_MAP[data.status.toLowerCase()];
    if (template) {
      for (const applicationId of data.applicationIds) {
        try {
          await enqueueStatusEmail(supabase, {
            applicationId,
            tenantId,
            template,
          });
        } catch {
          // Non-fatal per recipient.
        }
      }
    }

    return { ok: true, count: data.applicationIds.length };
  });
