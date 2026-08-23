import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  qualificationRank,
  scoreApplication,
  yearsFromExperience,
  yearsOptionFor,
  type OrsWeights,
  type OrsThresholds,
  type ScoredQuestion,
} from "@/lib/ors";
import { renderEmail, resolveEmailTemplate } from "@/lib/email-templates";
import { applyAutoPipeline } from "@/lib/auto-pipeline";

const educationSchema = z.object({
  qualification: z.string().trim().min(1).max(120),
  field_of_study: z.string().trim().max(120).optional().default(""),
  institution: z.string().trim().max(160).optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
  start_year: z.number().int().min(1950).max(2100).nullable().optional(),
  end_year: z.number().int().min(1950).max(2100).nullable().optional(),
});

const experienceSchema = z.object({
  employer: z.string().trim().min(1).max(160),
  position: z.string().trim().min(1).max(160),
  field: z.string().trim().max(120).optional().default(""),
  start_date: z.string().trim().max(20).nullable().optional(),
  end_date: z.string().trim().max(20).nullable().optional(),
  is_current: z.boolean().default(false),
  responsibilities: z.string().trim().max(2000).optional().default(""),
  reason_for_leaving: z.string().trim().max(500).optional().default(""),
});

const refereeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  organisation: z.string().trim().max(160).optional().default(""),
  position: z.string().trim().max(120).optional().default(""),
  relationship: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(255).optional().default(""),
});

const documentSchema = z.object({
  doc_type: z.string().trim().min(1).max(80),
  file_name: z.string().trim().min(1).max(255),
  file_path: z.string().trim().min(1).max(500),
  file_size: z
    .number()
    .int()
    .nonnegative()
    .max(10 * 1024 * 1024)
    .optional()
    .default(0),
});

const submitSchema = z.object({
  // Accepts either a UUID or a public_token (e.g. "pub-abc123")
  campaignId: z.string().min(1).max(200),
  consent: z.object({
    accepted: z.literal(true),
    version: z.string().trim().min(1).max(40),
  }),
  personal: z.object({
    first_name: z.string().trim().min(1).max(80),
    middle_name: z.string().trim().max(80).optional().default(""),
    last_name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().max(40).optional().default(""),
    date_of_birth: z.string().trim().max(20).optional().default(""),
    gender: z.string().trim().max(40).optional().default(""),
    nationality: z.string().trim().max(80).optional().default(""),
    location: z.string().trim().max(160).optional().default(""),
    country: z.string().trim().max(80).optional().default(""),
    city: z.string().trim().max(120).optional().default(""),
    professional_summary: z.string().trim().max(3000).optional().default(""),
    linkedin_url: z.string().trim().url().max(500).or(z.literal("")).default(""),
    portfolio_url: z.string().trim().url().max(500).or(z.literal("")).default(""),
  }),
  education: z.array(educationSchema).max(10).default([]),
  experience: z.array(experienceSchema).max(15).default([]),
  skills: z
    .array(
      z.object({ skill: z.string().trim().min(1).max(80), category: z.string().trim().max(40) }),
    )
    .max(60)
    .default([]),
  certifications: z
    .array(
      z.object({
        certification: z.string().trim().min(1).max(120),
        category: z.string().trim().max(40),
      }),
    )
    .max(40)
    .default([]),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  documents: z.array(documentSchema).max(12).default([]),
  referees: z.array(refereeSchema).max(4).default([]),
});

export type SubmitApplicationInput = z.infer<typeof submitSchema>;

function reference() {
  return `APP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Loads a campaign's scoring questions with their answer options. */
async function loadCampaignQuestions(
  campaignId: string,
): Promise<{
  questions: ScoredQuestion[];
  questionRows: (ScoredQuestion & {
    is_mandatory: boolean | null;
    campaign_answer_options: { value: string; points: number; is_disqualifying: boolean }[];
  })[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const questionsRes = await supabaseAdmin
    .from("campaign_questions")
    .select(
      "id, question_text, question_type, options, dimension, weight, is_mandatory, campaign_answer_options(value, points, is_disqualifying)",
    )
    .eq("campaign_id", campaignId)
    .order("sort_order");
  const questionRows = (questionsRes.data ?? []) as unknown as (ScoredQuestion & {
    is_mandatory: boolean | null;
    campaign_answer_options: { value: string; points: number; is_disqualifying: boolean }[];
  })[];
  const questions = questionRows.map((question) => ({
    ...question,
    options: parseJsonList(question.options),
    answer_options: Array.isArray(question.campaign_answer_options)
      ? question.campaign_answer_options.map((option) => ({
          value: option.value,
          points: option.points ?? 0,
        }))
      : [],
  })) as ScoredQuestion[];
  return { questions, questionRows };
}

/**
 * Public endpoint: stores a candidate application and runs the ORS scoring
 * engine against the campaign's requirements.
 */
export const submitApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve campaign: try public_token first, then id
    let campaignRes = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("public_token", data.campaignId)
      .maybeSingle();

    if (!campaignRes.data) {
      campaignRes = await supabaseAdmin
        .from("campaigns")
        .select("*")
        .eq("id", data.campaignId)
        .maybeSingle();
    }

    if (campaignRes.error) throw new Error(campaignRes.error.message);
    const campaign = campaignRes.data;
    if (!campaign) throw new Error("This campaign is not accepting applications.");
    if (campaign.status !== "active" && campaign.status !== "closing_soon") {
      throw new Error("This campaign is not accepting applications.");
    }

    const { questions, questionRows } = await loadCampaignQuestions(
      campaign.id as string,
    );

    // The wizard collects qualification and dated work history structurally, so
    // the old screening questions that re-asked them are no longer shown. For
    // campaigns created before that change, those questions still exist in the
    // DB — synthesize their answers from the structured data so scoring stays
    // identical and candidates are never flagged for not answering a hidden
    // question.
    const years = yearsFromExperience(
      data.experience.map((e) => ({
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        is_current: e.is_current,
      })),
    );
    const highest = data.education
      .map((e) => e.qualification)
      .sort((a, b) => qualificationRank(b) - qualificationRank(a))[0];
    const answers: Record<string, string | string[]> = { ...data.answers };
    for (const question of questionRows) {
      const key = question.id ?? question.question_text;
      if (answers[key]) continue;
      if (question.question_text === "What is your highest completed qualification?" && highest) {
        answers[key] = highest;
      } else if (
        question.question_text.startsWith("How many years of experience do you have in ")
      ) {
        answers[key] = yearsOptionFor(years);
      }
    }

    // Mandatory / disqualifying evaluation against the stored answer options.
    const mandatoryReasons: string[] = [];
    const pointsByQuestion = new Map<string, number>();
    for (const question of questionRows) {
      const raw = answers[question.id ?? question.question_text];
      const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (question.is_mandatory && values.length === 0) {
        mandatoryReasons.push(`No answer provided for: ${question.question_text}`);
        continue;
      }
      let points = 0;
      for (const value of values) {
        const option = (question.campaign_answer_options ?? []).find((o) => o.value === value);
        if (!option) continue;
        points += option.points ?? 0;
        if (option.is_disqualifying)
          mandatoryReasons.push(
            `${question.question_text}: "${value}" does not meet the requirement.`,
          );
      }
      if (question.id) pointsByQuestion.set(question.id, points);
    }
    const mandatoryStatus = mandatoryReasons.length ? "failed" : "passed";

    const tenantId = campaign.tenant_id as string;

    // Reject disposable / obviously-bad addresses before storing the candidate.
    // Free checks (format, disposable, MX) always run unless the tenant turned
    // verification off; a configured ZeroBounce key adds the deep check.
    const tenantSettingsRes = await supabaseAdmin
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenantSettingsRes.error) {
      const { parseTenantSettings } = await import("@/lib/tenant-settings");
      const tenantSettings = parseTenantSettings(
        (tenantSettingsRes.data as { settings?: unknown } | null)?.settings,
      );
      if (tenantSettings.email.verifyEmails !== false) {
        const { assertEmailUsable } = await import("@/lib/email-verify");
        await assertEmailUsable(data.personal.email, {
          zeroBounceKey: process.env["ZEROBOUNCE_API_KEY"] || null,
        });
      }
    }

    // Candidates are keyed by (tenant_id, email). Re-applications reuse the
    // existing candidate row and refresh their profile instead of crashing on
    // the unique constraint.
    const candidateProfile = {
      first_name: data.personal.first_name,
      middle_name: data.personal.middle_name || null,
      last_name: data.personal.last_name,
      email: data.personal.email,
      phone: data.personal.phone || null,
      date_of_birth: data.personal.date_of_birth || null,
      gender: data.personal.gender || null,
      nationality: data.personal.nationality || null,
      location:
        [data.personal.city, data.personal.country, data.personal.location]
          .filter(Boolean)
          .join(", ") || null,
      country: data.personal.country || null,
      city: data.personal.city || null,
      professional_summary: data.personal.professional_summary || null,
      linkedin_url: data.personal.linkedin_url || null,
      portfolio_url: data.personal.portfolio_url || null,
    };
    const existingCandidate = await supabaseAdmin
      .from("candidates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", data.personal.email)
      .maybeSingle();
    let candidateId: string;
    if (existingCandidate.data?.id) {
      candidateId = existingCandidate.data.id as string;
      await supabaseAdmin.from("candidates").update(candidateProfile).eq("id", candidateId);
    } else {
      const candidateRes = await supabaseAdmin
        .from("candidates")
        .insert({ tenant_id: tenantId, ...candidateProfile })
        .select("id")
        .single();
      if (candidateRes.error) throw new Error(candidateRes.error.message);
      candidateId = candidateRes.data.id as string;
    }

    // Candidates can resubmit the same campaign (e.g. resuming a saved draft
    // and submitting again). The applications table is unique per
    // (tenant, campaign, candidate), so an existing row is updated in place —
    // score and structured data refresh while the recruiter's stage/status
    // decisions are preserved.
    const existingAppRes = await supabaseAdmin
      .from("applications")
      .select("id, reference, status, stage_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaign.id)
      .eq("candidate_id", candidateId)
      .maybeSingle();
    if (existingAppRes.error) throw new Error(existingAppRes.error.message);
    const existingApplication = existingAppRes.data as {
      id: string;
      reference: string;
      status: string | null;
      stage_id: string | null;
    } | null;
    // Certifications the candidate actually holds — selected directly on the
    // Certifications step, plus any affirmed in the per-certification
    // screening questions ("Do you hold the ACCA certification?").
    const certificationsHeld = [
      ...data.certifications.map((cert) => cert.certification),
      ...questionRows
        .filter((question) => (question.dimension ?? "") === "certification")
        .map((question) => {
          const raw = data.answers[question.id ?? question.question_text];
          const value = Array.isArray(raw) ? raw[0] : raw;
          if (!value) return null;
          const affirmed = ["yes", "y", "true", "1"].includes(String(value).trim().toLowerCase());
          return affirmed ? certificationNameFromQuestion(question.question_text) : null;
        })
        .filter((name): name is string => Boolean(name)),
    ];

    const scored = scoreApplication(
      {
        weights: parseJsonObject<Partial<OrsWeights>>(campaign.weights) ?? {},
        thresholds: parseJsonObject<Partial<OrsThresholds>>(campaign.thresholds) ?? {},
        min_qualification: campaign.min_qualification,
        min_experience_years: campaign.min_experience_years,
        required_skills: parseJsonList(campaign.required_skills),
        required_certifications: parseJsonList(campaign.required_certifications),
        competencies: parseJsonList(campaign.competencies),
        fields_of_study: fieldsOfStudyFromBuilder(campaign.builder),
        experience_fields: experienceFieldsFromBuilder(campaign.builder),
        experience_recency_years: experienceRecencyYearsFromBuilder(campaign.builder),
        qualification_preferred: qualificationPreferredFromBuilder(campaign.builder),
        referee_count: campaign.referee_count,
        location_countries: locationCountriesFromBuilder(campaign.builder, campaign.country),
        target_occupation: campaign.job_title as string,
        target_job_family: jobFamilyFromBuilder(campaign.builder),
        highly_relevant_positions: highlyRelevantPositionsFromBuilder(campaign.builder),
        related_positions: relatedPositionsFromBuilder(campaign.builder),
        industry: industryFromBuilder(campaign.builder),
      },
      {
        highest_qualification: highest ?? null,
        years_experience: years,
        recent_relevant_years: recentRelevantYears(
          data.experience,
          campaign.builder,
        ),
        skills: data.skills.map((s) => s.skill),
        certifications: certificationsHeld,
        fields_of_study: data.education.map((education) => education.field_of_study),
        work_fields: data.experience.map((entry) => entry.field).filter(Boolean),
        country: data.personal.country || null,
        referee_count: data.referees.length,
        answers,
        questions,
        position_history: data.experience.map((entry) => ({
          title: entry.position,
          start_date: entry.start_date ?? null,
          end_date: entry.end_date ?? null,
          is_current: entry.is_current,
          field: entry.field || null,
        })),
        industry: industryFromBuilder(campaign.builder),
      },
    );

    const stageRes = await supabaseAdmin
      .from("recruitment_stages")
      .select("id, name")
      .eq("campaign_id", campaign.id)
      .order("position")
      .limit(1)
      .maybeSingle();

    const scoreFields = {
      score: scored.total,
      score_breakdown: scored.breakdown,
      recommendation: !scored.eligible || mandatoryReasons.length ? "Weak Match" : scored.recommendation,
      mandatory_status: mandatoryStatus,
      mandatory_reasons: mandatoryReasons,
      eligibility_status: scored.eligible && !mandatoryReasons.length ? "eligible" : "not_eligible",
      eligibility_reasons: JSON.stringify(scored.eligibility),
      score_reasons: JSON.stringify(scored.reasons),
      score_version: scored.score_version,

      years_experience: years,
      highest_qualification: highest ?? null,
      cv_url: data.documents.find((d) => d.doc_type.toLowerCase() === "cv")?.file_path ?? null,
      consent_given: data.consent.accepted,
      consent_given_at: new Date().toISOString(),
      consent_version: data.consent.version,
    };

    let applicationId: string;
    let applicationReference: string;
    if (existingApplication) {
      await supabaseAdmin
        .from("applications")
        .update({ ...scoreFields, submitted_at: new Date().toISOString() })
        .eq("id", existingApplication.id);
      applicationId = existingApplication.id;
      applicationReference = existingApplication.reference;
      // Replace the candidate's structured data so a resubmission never
      // duplicates education/experience/skills/documents/answers rows.
      for (const table of [
        "candidate_education",
        "candidate_experience",
        "candidate_skills",
        "candidate_certifications",
        "candidate_documents",
        "candidate_referees",
        "candidate_answers",
      ]) {
        const removed = await supabaseAdmin
          .from(table)
          .delete()
          .eq("application_id", applicationId);
        if (removed.error) throw new Error(removed.error.message);
      }
    } else {
      const applicationRes = await supabaseAdmin
        .from("applications")
        .insert({
          tenant_id: tenantId,
          campaign_id: campaign.id,
          candidate_id: candidateId,
          reference: reference(),
          status: "submitted",
          stage_id: stageRes.data?.id ?? null,
          submitted_at: new Date().toISOString(),
          ...scoreFields,
        })
        .select("id, reference")
        .single();
      if (applicationRes.error) throw new Error(applicationRes.error.message);
      applicationId = applicationRes.data.id as string;
      applicationReference = applicationRes.data.reference as string;
    }

    const withIds = <T extends object>(rows: T[]) =>
      rows.map((row) => ({ ...row, tenant_id: tenantId, application_id: applicationId }));

    if (data.education.length)
      await supabaseAdmin.from("candidate_education").insert(
        withIds(
          data.education.map((e) => ({
            qualification: e.qualification,
            field_of_study: e.field_of_study,
            institution: e.institution,
            country: e.country,
            start_year: e.start_year ?? null,
            end_year: e.end_year ?? null,
          })),
        ),
      );
    if (data.experience.length)
      await supabaseAdmin.from("candidate_experience").insert(
        withIds(
          data.experience.map((e) => ({
            employer: e.employer,
            position: e.position,
            field: e.field || null,
            start_date: e.start_date ?? null,
            end_date: e.end_date ?? null,
            is_current: e.is_current,
            responsibilities: e.responsibilities,
            reason_for_leaving: e.reason_for_leaving,
          })),
        ),
      );
    if (data.skills.length)
      await supabaseAdmin.from("candidate_skills").insert(withIds(data.skills));
    if (data.certifications.length)
      await supabaseAdmin
        .from("candidate_certifications")
        .insert(withIds(data.certifications));
    if (data.documents.length)
      await supabaseAdmin.from("candidate_documents").insert(withIds(data.documents));
    if (data.referees.length)
      await supabaseAdmin.from("candidate_referees").insert(withIds(data.referees));

    const answerRows = questions.map((question) => {
      const raw = answers[question.id ?? question.question_text];
      return {
        tenant_id: tenantId,
        application_id: applicationId,
        question_id: question.id ?? null,
        question_text: question.question_text,
        answer: Array.isArray(raw) ? raw.join(", ") : (raw ?? null),
        dimension: String(question.dimension),
        points: question.id ? (pointsByQuestion.get(question.id) ?? 0) : 0,
      };
    });
    if (answerRows.length) await supabaseAdmin.from("candidate_answers").insert(answerRows);

    if (!existingApplication) {
      await supabaseAdmin.from("application_stage_history").insert({
        tenant_id: tenantId,
        application_id: applicationId,
        to_stage: stageRes.data?.name ?? "Applied",
      });
    }

    // Automated "application received" mail — only for first-time submissions;
    // a resubmission is an in-place refresh, not a second application.
    if (!existingApplication) {
      const tenantRes = await supabaseAdmin
        .from("tenants")
        .select("name, settings")
        .eq("id", tenantId)
        .maybeSingle();
      const { parseTenantSettings } = await import("@/lib/tenant-settings");
      const tenantSettings = parseTenantSettings(
        (tenantRes.data as { settings?: unknown } | null)?.settings,
      );
      const receivedMail = renderEmail(
        resolveEmailTemplate("application_received", tenantSettings.emailTemplates),
        {
          first_name: data.personal.first_name,
          job_title: campaign.job_title as string | null,
          company: (tenantRes.data?.name as string | undefined) ?? null,
          reference: applicationReference,
        },
      );
      await supabaseAdmin.from("communications").insert({
        tenant_id: tenantId,
        application_id: applicationId,
        channel: "email",
        template: "application_received",
        subject: receivedMail.subject,
        body: receivedMail.body,
        html_body: receivedMail.html,
        recipient: data.personal.email,
        status: "queued",
      });
    }

    // Best-effort immediate dispatch (SMTP/Resend when configured, log mode
    // otherwise) so the acknowledgement goes out without waiting for a queue
    // worker. The row stays "queued" on failure for the next flush.
    try {
      const { flushQueuedCommunications } = await import("@/lib/email-dispatch");
      await flushQueuedCommunications(supabaseAdmin, tenantId);
    } catch {
      // Non-fatal — the worker / manual flush will pick it up.
    }

    // Opt-in auto-pipeline: if the tenant enabled it, route the application
    // to Shortlisted / Manual Review / Rejected based on eligibility + score.
    // On a resubmission the recruiter's decisions are respected — an
    // application that was already shortlisted or rejected is left where it is.
    try {
      await applyAutoPipeline({
        tenantId,
        campaignId: data.campaignId,
        applicationId,
        currentStatus: existingApplication ? existingApplication.status : null,
        scored,
        respectDecisions: Boolean(existingApplication),
      });
    } catch {
      // Best-effort — a pipeline failure must never block a submission.
    }

    return {
      reference: applicationReference,
      score: scored.total,
      recommendation: scored.recommendation,
    };
  });

/**
 * Re-runs the ORS engine over every application in a campaign and persists
 * the updated score, eligibility and reasons under a new score_version.
 * Used when scoring rules change — the campaign page exposes this as
 * "Re-score applications".
 */
export const rescoreCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const value = (input ?? {}) as { campaignId?: unknown };
    if (typeof value.campaignId !== "string" || !value.campaignId.trim())
      throw new Error("campaignId is required");
    return { campaignId: value.campaignId };
  })
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    // Only the owning tenant may re-score a campaign.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const campaignRes = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("id", data.campaignId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (campaignRes.error) throw new Error(campaignRes.error.message);
    if (!campaignRes.data) throw new Error("Campaign not found.");

    return rescoreCampaignCore(data.campaignId);
  });

/** Plain core so scripts/tests can re-score without the Start runtime. */
export async function rescoreCampaignCore(campaignId: string): Promise<{
  rescored: number;
  version: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const campaignRes = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignRes.error) throw new Error(campaignRes.error.message);
    const campaign = campaignRes.data;
    if (!campaign) throw new Error("Campaign not found.");

    const { questions, questionRows } = await loadCampaignQuestions(
      campaign.id as string,
    );

    const appsRes = await supabaseAdmin
      .from("applications")
      .select("id, candidate_id, tenant_id, status")
      .eq("campaign_id", campaign.id);
    const applications = (appsRes.data ?? []) as {
      id: string;
      candidate_id: string;
      tenant_id: string;
      status?: string | null;
    }[];

    let rescored = 0;
    for (const application of applications) {
      const [candidateRes, educationRes, experienceRes, skillsRes, certsRes, answersRes, refereesRes] =
        await Promise.all([
          supabaseAdmin.from("candidates").select("country").eq("id", application.candidate_id).maybeSingle(),
          supabaseAdmin
            .from("candidate_education")
            .select("qualification, field_of_study")
            .eq("application_id", application.id),
          supabaseAdmin
            .from("candidate_experience")
            .select("position, field, start_date, end_date, is_current")
            .eq("application_id", application.id),
          supabaseAdmin.from("candidate_skills").select("skill").eq("application_id", application.id),
          supabaseAdmin
            .from("candidate_certifications")
            .select("certification")
            .eq("application_id", application.id),
          supabaseAdmin
            .from("candidate_answers")
            .select("question_id, question_text, answer")
            .eq("application_id", application.id),
          supabaseAdmin.from("candidate_referees").select("id").eq("application_id", application.id),
        ]);

      const candidate = candidateRes.data as { country?: string | null } | null;
      const education = (educationRes.data ?? []) as { qualification: string; field_of_study?: string | null }[];
      const experience = (experienceRes.data ?? []) as {
        position: string;
        field?: string | null;
        start_date?: string | null;
        end_date?: string | null;
        is_current?: boolean | number | null;
      }[];
      const skills = (skillsRes.data ?? []) as { skill: string }[];
      const certs = (certsRes.data ?? []) as { certification: string }[];
      const answerRows = (answersRes.data ?? []) as {
        question_id?: string | null;
        question_text: string;
        answer?: string | null;
      }[];
      const referees = (refereesRes.data ?? []) as { id: string }[];

      // Reconstruct the same inputs the submit path computes.
      const years = yearsFromExperience(
        experience.map((e) => ({
          start_date: e.start_date ?? null,
          end_date: e.end_date ?? null,
          is_current: Boolean(e.is_current),
        })),
      );
      const highest = education
        .map((e) => e.qualification)
        .sort((a, b) => qualificationRank(b) - qualificationRank(a))[0];
      const answers: Record<string, string | string[]> = {};
      for (const row of answerRows) {
        if (!row.answer) continue;
        answers[row.question_id ?? row.question_text] = row.answer.includes(", ")
          ? row.answer.split(", ")
          : row.answer;
      }
      for (const question of questionRows) {
        const key = question.id ?? question.question_text;
        if (answers[key]) continue;
        if (question.question_text === "What is your highest completed qualification?" && highest) {
          answers[key] = highest;
        } else if (question.question_text.startsWith("How many years of experience do you have in ")) {
          answers[key] = yearsOptionFor(years);
        }
      }

      const mandatoryReasons: string[] = [];
      for (const question of questionRows) {
        const raw = answers[question.id ?? question.question_text];
        const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
        if (question.is_mandatory && values.length === 0) {
          mandatoryReasons.push(`No answer provided for: ${question.question_text}`);
          continue;
        }
        for (const value of values) {
          const option = (question.campaign_answer_options ?? []).find((o) => o.value === value);
          if (option?.is_disqualifying)
            mandatoryReasons.push(
              `${question.question_text}: "${value}" does not meet the requirement.`,
            );
        }
      }

      const certificationsHeld = [
        ...certs.map((c) => c.certification),
        ...answerRows
          .filter((row) => {
            const dim = row.question_text.includes("certification")
              ? "certification"
              : null;
            return dim !== null;
          })
          .map((row) => {
            const affirmed = ["yes", "y", "true", "1"].includes(
              String(row.answer ?? "").trim().toLowerCase(),
            );
            return affirmed ? certificationNameFromQuestion(row.question_text) : null;
          })
          .filter((name): name is string => Boolean(name)),
      ];

      const scored = scoreApplication(
        {
          weights: parseJsonObject<Partial<OrsWeights>>(campaign.weights) ?? {},
          thresholds: parseJsonObject<Partial<OrsThresholds>>(campaign.thresholds) ?? {},
          min_qualification: campaign.min_qualification,
          min_experience_years: campaign.min_experience_years,
          required_skills: parseJsonList(campaign.required_skills),
          required_certifications: parseJsonList(campaign.required_certifications),
          competencies: parseJsonList(campaign.competencies),
          fields_of_study: fieldsOfStudyFromBuilder(campaign.builder),
          experience_fields: experienceFieldsFromBuilder(campaign.builder),
          experience_recency_years: experienceRecencyYearsFromBuilder(campaign.builder),
          qualification_preferred: qualificationPreferredFromBuilder(campaign.builder),
          referee_count: campaign.referee_count,
          location_countries: locationCountriesFromBuilder(campaign.builder, campaign.country),
          target_occupation: campaign.job_title as string,
          target_job_family: jobFamilyFromBuilder(campaign.builder),
          highly_relevant_positions: highlyRelevantPositionsFromBuilder(campaign.builder),
          related_positions: relatedPositionsFromBuilder(campaign.builder),
          industry: industryFromBuilder(campaign.builder),
        },
        {
          highest_qualification: highest ?? null,
          years_experience: years,
          recent_relevant_years: recentRelevantYears(
            experience.map((e) => ({
              start_date: e.start_date ?? null,
              end_date: e.end_date ?? null,
              is_current: Boolean(e.is_current),
              field: e.field ?? null,
            })),
            campaign.builder,
          ),
          skills: skills.map((s) => s.skill),
          certifications: certificationsHeld,
          fields_of_study: education.map((e) => e.field_of_study ?? "").filter(Boolean),
          work_fields: experience.map((e) => e.field ?? "").filter(Boolean),
          country: candidate?.country ?? null,
          referee_count: referees.length,
          answers,
          questions,
          position_history: experience.map((e) => ({
            title: e.position,
            start_date: e.start_date ?? null,
            end_date: e.end_date ?? null,
            is_current: Boolean(e.is_current),
            field: e.field ?? null,
          })),
          industry: industryFromBuilder(campaign.builder),
        },
      );

      const update = await supabaseAdmin
        .from("applications")
        .update({
          score: scored.total,
          score_breakdown: scored.breakdown,
      recommendation:
        !scored.eligible || mandatoryReasons.length ? "Weak Match" : scored.recommendation,
          eligibility_status: scored.eligible && !mandatoryReasons.length ? "eligible" : "not_eligible",
          eligibility_reasons: JSON.stringify(scored.eligibility),
          score_reasons: JSON.stringify(scored.reasons),
          score_version: scored.score_version,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);
      if (update.error) throw new Error(update.error.message);
      rescored += 1;

      // Re-apply the opt-in auto-pipeline, but never override decisions the
      // recruiter has already made (shortlisted / interview / offer / etc.).
      try {
        await applyAutoPipeline({
          tenantId: application.tenant_id,
          campaignId,
          applicationId: application.id,
          currentStatus: application.status ?? null,
          scored,
          respectDecisions: true,
        });
      } catch {
        // Best-effort on rescore.
      }
    }

    return { rescored, version: "ors-v2" };
}

/** Extracts the certification name from a builder question, e.g. "Do you hold the ACCA certification?" -> "ACCA". */
function certificationNameFromQuestion(text: string): string | null {
  const match = text.match(/hold (?:a |the )?(.+?)\s*certification\??$/i);
  return match?.[1]?.trim() ?? null;
}

function parseJsonList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject<T>(value: unknown): T | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function fieldsOfStudyFromBuilder(builder: unknown): string[] {
  const parsed = parseJsonObject<{ fieldsOfStudy?: unknown }>(builder);
  if (!parsed) return [];
  const fields = parsed.fieldsOfStudy;
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === "string")
    : [];
}

/**
 * The campaign's expected fields of work, most specific first: the occupation
 * (job title, e.g. the ESCO occupation the recruiter picked), then the ISCO
 * job family, then the wider experience areas. Experience earned in one of
 * these fields earns full credit in the ORS engine; a different field halves
 * it even when the minimum years are met.
 */
function experienceFieldsFromBuilder(builder: unknown): string[] {
  const parsed = parseJsonObject<{
    jobTitle?: unknown;
    jobFamilyName?: unknown;
    experienceAreas?: unknown;
  }>(builder);
  if (!parsed) return [];
  const fields: string[] = [];
  if (typeof parsed.jobTitle === "string" && parsed.jobTitle.trim()) {
    fields.push(parsed.jobTitle.trim());
  }
  if (typeof parsed.jobFamilyName === "string" && parsed.jobFamilyName.trim()) {
    fields.push(parsed.jobFamilyName.trim());
  }
  if (Array.isArray(parsed.experienceAreas)) {
    for (const area of parsed.experienceAreas) {
      if (typeof area === "string" && area.trim()) fields.push(area.trim());
    }
  }
  return [...new Set(fields)];
}

/** Recency window from the builder — null (default) disables the penalty. */
function experienceRecencyYearsFromBuilder(builder: unknown): number | null {
  const parsed = parseJsonObject<{ experienceRecencyYears?: unknown }>(builder);
  const raw = parsed?.experienceRecencyYears;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** Whether the qualification was marked "preferred" rather than strictly required. */
function qualificationPreferredFromBuilder(builder: unknown): boolean {
  const parsed = parseJsonObject<{ qualificationLevel?: unknown }>(builder);
  return parsed?.qualificationLevel === "preferred";
}

/**
 * Countries the campaign restricts applications to, from the builder's
 * location config. Defaults to the campaign's country when set.
 */
function locationCountriesFromBuilder(
  builder: unknown,
  campaignCountry?: string | null,
): string[] | null {
  const parsed = parseJsonObject<{
    locationCountry?: unknown;
    locationCountries?: unknown;
    country?: unknown;
  }>(builder);
  const raw =
    parsed?.locationCountries ??
    parsed?.locationCountry ??
    parsed?.country ??
    campaignCountry;
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (Array.isArray(raw)) {
    const countries = raw.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    return countries.length ? countries : null;
  }
  return null;
}

/** Extracts highly relevant positions from the builder. */
function highlyRelevantPositionsFromBuilder(builder: unknown): string[] {
  const parsed = parseJsonObject<{ highlyRelevantPositions?: unknown }>(builder);
  if (!parsed) return [];
  const positions = parsed.highlyRelevantPositions;
  return Array.isArray(positions)
    ? positions.filter((p): p is string => typeof p === "string" && Boolean(p.trim()))
    : [];
}

/** Extracts related positions from the builder. */
function relatedPositionsFromBuilder(builder: unknown): string[] {
  const parsed = parseJsonObject<{ relatedPositions?: unknown }>(builder);
  if (!parsed) return [];
  const positions = parsed.relatedPositions;
  return Array.isArray(positions)
    ? positions.filter((p): p is string => typeof p === "string" && Boolean(p.trim()))
    : [];
}

/** Extracts industry from the builder. */
function industryFromBuilder(builder: unknown): string | null {
  const parsed = parseJsonObject<{ industry?: unknown }>(builder);
  const raw = parsed?.industry;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Extracts job family from the builder. */
function jobFamilyFromBuilder(builder: unknown): string | null {
  const parsed = parseJsonObject<{ jobFamilyName?: unknown }>(builder);
  const raw = parsed?.jobFamilyName;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Years of experience in a field the campaign expects, earned within the
 * campaign's recency window (defaults to 5 years when enabled) — recency
 * evidence for the ORS engine. Only consumed when the campaign opts in.
 */
function recentRelevantYears(
  experience: { start_date?: string | null | undefined; end_date?: string | null | undefined; is_current?: boolean; field?: string | null }[],
  builder: unknown,
): number {
  const expected = normaliseForMatch(experienceFieldsFromBuilder(builder));
  if (!expected.length) return 0;
  const windowYears = experienceRecencyYearsFromBuilder(builder) ?? 5;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - windowYears);
  let months = 0;
  for (const record of experience) {
    if (!record.start_date) continue;
    const heldField = record.field?.trim().toLowerCase() ?? "";
    const relevant = expected.some(
      (field) => field === heldField || (heldField && field.includes(heldField)) || (heldField && heldField.includes(field)),
    );
    if (!relevant) continue;
    const start = new Date(record.start_date);
    const end = record.is_current || !record.end_date ? new Date() : new Date(record.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const overlapStart = new Date(Math.max(start.getTime(), cutoff.getTime()));
    if (end <= overlapStart) continue;
    const startMonth = overlapStart.getFullYear() * 12 + overlapStart.getMonth();
    const endMonth = end.getFullYear() * 12 + end.getMonth();
    if (endMonth > startMonth) months += endMonth - startMonth;
  }
  return Math.round((months / 12) * 10) / 10;
}

function normaliseForMatch(items: string[]): string[] {
  return items
    .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean);
}
