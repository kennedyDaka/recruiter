import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  saveCampaignSchema,
  publishSchema,
  type SaveCampaignInput,
} from "@/lib/campaign-builder.schema";

const DEFAULT_STAGES = ["Applied", "Screening", "Shortlisted", "Interview", "Offer", "Hired"];

/** Creates or updates a draft campaign from the structured builder. */
export const saveCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveCampaignSchema.parse(input) as SaveCampaignInput)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { requireWorkspaceForUser } = await import("@/lib/workspace.server");
    const { tenantId } = await requireWorkspaceForUser(context.userId);

    const slugBase = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

    const payload = {
      tenant_id: tenantId,
      name: data.name,
      job_title: data.jobTitle,
      job_description: data.jobDescription,
      hiring_reason: data.hiringReason || null,
      positions: data.positions,
      location: data.location || null,
      employment_type: data.employmentType || null,
      min_qualification: data.minQualification || null,
      min_experience_years: data.minExperienceYears,
      required_skills: data.requiredSkills,
      required_certifications: data.requiredCertifications,
      responsibilities: data.responsibilities,
      required_documents: data.requiredDocuments,
      salary_min: data.salaryMin,
      salary_max: data.salaryMax,
      salary_currency: data.salaryCurrency,
      start_date: data.startDate || null,
      closing_date: data.closingDate || null,
      weights: data.weights as unknown as Json,
      builder: data.builder as unknown as Json,
      scoring_model: data.scoringModel ? JSON.stringify(data.scoringModel) : null,
      logo_data: data.logoData ?? null,
      brand_color: data.brandColor || "#2563eb",
      brand_font: data.brandFont || "Inter",
      company_name: data.companyName || null,
      status: "draft" as const,
    };

    let campaignId = data.campaignId ?? null;
    if (campaignId) {
      // Only the owning tenant may edit a draft — the scoped builder injects
      // tenant_id into the WHERE, so a foreign id matches nothing; verify it
      // exists rather than silently no-oping.
      const owned = await supabase
        .from("campaigns")
        .select("id")
        .eq("id", campaignId)
        .maybeSingle();
      if (owned.error) throw new Error(owned.error.message);
      if (!owned.data) throw new Error("Campaign not found.");

      const updated = await supabase.from("campaigns").update(payload).eq("id", campaignId);
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const created = await supabase
        .from("campaigns")
        .insert({
          ...payload,
          slug: `${slugBase || "campaign"}-${Math.random().toString(36).slice(2, 6)}`,
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      campaignId = created.data.id as string;

      const stages = await supabase.from("recruitment_stages").insert(
        DEFAULT_STAGES.map((name, index) => ({
          tenant_id: tenantId,
          campaign_id: campaignId as string,
          name,
          position: index,
          is_terminal: name === "Hired",
        })),
      );
      if (stages.error) throw new Error(stages.error.message);
    }

    // Rewrite the question set — bulk-insert for performance.
    const deletedQuestions = await supabase
      .from("campaign_questions")
      .delete()
      .eq("campaign_id", campaignId);
    if (deletedQuestions.error) throw new Error(deletedQuestions.error.message);

    if (data.questions.length > 0) {
      // Insert all questions in one batch
      const questionRows = data.questions.map((question, sort) => ({
        tenant_id: tenantId,
        campaign_id: campaignId,
        question_text: question.text,
        question_type: question.type,
        options: question.options as unknown as Json,
        dimension: question.category,
        weight: 1,
        sort_order: sort,
        category: question.category,
        is_mandatory: question.mandatory,
        condition: (question.condition ?? null) as unknown as Json,
      }));
      const inserted = await supabase
        .from("campaign_questions")
        .insert(questionRows)
        .select("id");
      if (inserted.error) throw new Error(inserted.error.message);

      // Insert all answer options in one batch
      const optionRows: any[] = [];
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
        if (!q) continue;
        const questionId = inserted.data?.[i]?.id;
        if (!questionId || !q.options.length) continue;
        for (let j = 0; j < q.options.length; j++) {
          const opt = q.options[j];
          if (!opt) continue;
          optionRows.push({
            tenant_id: tenantId,
            question_id: questionId,
            label: opt.label,
            value: opt.value,
            points: opt.points,
            is_disqualifying: Boolean(opt.disqualifying),
            sort_order: j,
          });
        }
      }
      if (optionRows.length > 0) {
        const optionsRes = await supabase.from("campaign_answer_options").insert(optionRows);
        if (optionsRes.error) throw new Error(optionsRes.error.message);
      }
    }

    return { campaignId: campaignId as string };
  });

/**
 * Prepares a campaign for publishing by creating an invoice and redirecting
 * to the payment page. The campaign is NOT activated until payment is confirmed
 * via webhook verification.
 */
export const publishCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => publishSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const campaignRes = await supabase
      .from("campaigns")
      .select("id, tenant_id, start_date, closing_date, public_token, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (campaignRes.error) throw new Error(campaignRes.error.message);
    const campaign = campaignRes.data;
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status !== "draft") throw new Error("Campaign is not in draft status.");

    const start = campaign.start_date ?? new Date().toISOString().slice(0, 10);
    const closing = campaign.closing_date;
    if (!closing) throw new Error("Set a closing date before publishing.");
    const days = Math.max(
      1,
      Math.ceil((new Date(closing).getTime() - new Date(start).getTime()) / 86_400_000) + 1,
    );

    // Update campaign status to indicate payment is pending.
    // Public token is NOT generated here — it is only created when the
    // webhook confirms payment. The link is the product.
    await supabase
      .from("campaigns")
      .update({
        status: "pending_payment",
        start_date: start,
      })
      .eq("id", campaign.id);

    return {
      campaignId: campaign.id as string,
      days,
      paymentPath: `/campaigns/${campaign.id as string}/pay`,
    };
  });
