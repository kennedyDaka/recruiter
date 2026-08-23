/**
 * Opt-in auto-pipeline triage.
 *
 * When a tenant enables it (at registration or in Settings), newly scored
 * applications are placed automatically:
 *   - not eligible            -> Rejected
 *   - eligible, >= shortlistMin -> Shortlisted
 *   - eligible, >= reviewMin    -> Manual Review
 *   - otherwise                -> stays in the default stage
 *
 * The toggle is OFF by default — recruiters opt in explicitly, so nothing
 * ever moves without them choosing automation.
 */

import { parseTenantSettings } from "@/lib/tenant-settings";
import type { OrsResult } from "@/lib/ors";

export type AutoPipelineTarget = {
  stage: string;
  status: string;
};

/** Pure rule: which stage/status a scored application should land in, or null. */
export function autoPipelineTarget(
  settings: ReturnType<typeof parseTenantSettings>,
  scored: Pick<OrsResult, "total" | "eligible">,
): AutoPipelineTarget | null {
  const auto = settings.autoPipeline;
  if (!auto.enabled) return null;
  if (!scored.eligible) return { stage: "Rejected", status: "rejected" };
  if (scored.total >= auto.shortlistMin) return { stage: "Shortlisted", status: "shortlisted" };
  if (scored.total >= auto.reviewMin) return { stage: "Manual Review", status: "under_review" };
  return null;
}

/**
 * Applies the auto-pipeline rule for one application, creating the target
 * stage when the campaign lacks it. Returns the outcome or null when the
 * tenant hasn't opted in (or the rule keeps the application where it is).
 */
export async function applyAutoPipeline(args: {
  tenantId: string;
  campaignId: string;
  applicationId: string;
  currentStatus?: string | null;
  scored: Pick<OrsResult, "total" | "eligible">;
  /** On rescore, don't clobber decisions recruiters already made. */
  respectDecisions?: boolean;
}): Promise<AutoPipelineTarget | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const tenantRes = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", args.tenantId)
    .maybeSingle();
  const settings = parseTenantSettings((tenantRes.data as { settings?: unknown } | null)?.settings);

  const target = autoPipelineTarget(settings, args.scored);
  if (!target) return null;

  if (args.respectDecisions) {
    const status = (args.currentStatus ?? "").toLowerCase();
    if (status === "shortlisted" || status === "interview" || status === "offer" || status === "hired" || status === "rejected" || status === "withdrawn") {
      return null;
    }
  }

  // Find-or-create the target stage for this campaign.
  let stageRes = await supabaseAdmin
    .from("recruitment_stages")
    .select("id, name")
    .eq("campaign_id", args.campaignId)
    .eq("name", target.stage)
    .maybeSingle();
  if (stageRes.error) throw new Error(stageRes.error.message);
  let stageId: string | null = stageRes.data?.id ?? null;
  if (!stageId) {
    const positionRes = await supabaseAdmin
      .from("recruitment_stages")
      .select("position")
      .eq("campaign_id", args.campaignId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = Number((positionRes.data as { position?: number } | null)?.position ?? 0) + 1;
    const created = await supabaseAdmin
      .from("recruitment_stages")
      .insert({
        tenant_id: args.tenantId,
        campaign_id: args.campaignId,
        name: target.stage,
        position,
        is_terminal: target.stage === "Rejected",
      })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    stageId = created.data?.id ?? null;
  }

  const currentRes = await supabaseAdmin
    .from("applications")
    .select("stage_id, status")
    .eq("id", args.applicationId)
    .maybeSingle();
  const previous = currentRes.data as { stage_id?: string | null; status?: string | null } | null;

  const updated = await supabaseAdmin
    .from("applications")
    .update({ stage_id: stageId, status: target.status })
    .eq("id", args.applicationId);
  if (updated.error) throw new Error(updated.error.message);

  const fromStageRes = stageId
    ? await supabaseAdmin.from("recruitment_stages").select("name").eq("id", previous?.stage_id ?? "").maybeSingle()
    : null;

  await supabaseAdmin.from("application_stage_history").insert({
    tenant_id: args.tenantId,
    application_id: args.applicationId,
    from_stage: fromStageRes?.data?.name ?? previous?.status ?? null,
    to_stage: target.stage,
    changed_by: "system",
  });

  // Automated mail follows the auto-move (shortlist / reject), rendered from
  // the shared templates and dispatched best-effort like manual stage moves.
  try {
    const { renderEmail } = await import("@/lib/email-templates");
    const appRes = await supabaseAdmin
      .from("applications")
      .select("id, reference, candidates(email, first_name, last_name), campaigns(job_title)")
      .eq("id", args.applicationId)
      .maybeSingle();
    const application = appRes.data as
      | { reference: string; candidates?: { email: string; first_name: string; last_name: string | null } | null; campaigns?: { job_title?: string | null } | null }
      | null;
    const candidate = application?.candidates;
    const campaign = application?.campaigns;
    if (application && candidate?.email) {
      const tenantRes = await supabaseAdmin
        .from("tenants")
        .select("name")
        .eq("id", args.tenantId)
        .maybeSingle();
      const template = target.stage === "Rejected" ? "rejected" : "shortlisted";
      const rendered = renderEmail(template, {
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        job_title: campaign?.job_title ?? null,
        company: (tenantRes.data as { name?: string } | null)?.name ?? null,
        reference: application.reference,
      });
      await supabaseAdmin.from("communications").insert({
        tenant_id: args.tenantId,
        application_id: args.applicationId,
        channel: "email",
        template,
        subject: rendered.subject,
        body: rendered.body,
        html_body: rendered.html,
        recipient: candidate.email,
        status: "queued",
      });
      const { flushQueuedCommunications } = await import("@/lib/email-dispatch");
      await flushQueuedCommunications(supabaseAdmin, args.tenantId);
    }
  } catch {
    // Best-effort — a failed automated email must never break the pipeline move.
  }

  return target;
}
