import { createWorker, createQueue, QUEUES } from "@/lib/queue";
import { dbQueryFirst, dbExecute, dbQuery } from "@/lib/db";
import { scoreApplication } from "@/lib/ors";

const scoringWorker = createQueue(QUEUES.SCORING);

const scoringProcessor = createWorker("scoring", async (job) => {
  const { applicationId, tenantId } = job.data;

  console.log(`[Scoring Worker] Scoring application ${applicationId}`);

  const application = await dbQueryFirst(
    "SELECT * FROM applications WHERE id = ?",
    [applicationId],
  );

  if (!application) throw new Error(`Application ${applicationId} not found`);

  const campaign = await dbQueryFirst(
    "SELECT * FROM campaigns WHERE id = ?",
    [application.campaign_id],
  );
  if (!campaign) throw new Error(`Campaign ${application.campaign_id} not found`);

  const candidate = await dbQueryFirst("SELECT * FROM candidates WHERE id = ?", [
    application.candidate_id,
  ]);
  const education = await dbQuery(
    "SELECT * FROM candidate_education WHERE application_id = ?",
    [applicationId],
  );
  const experience = await dbQuery(
    "SELECT * FROM candidate_experience WHERE application_id = ?",
    [applicationId],
  );
  const skills = await dbQuery("SELECT * FROM candidate_skills WHERE application_id = ?", [
    applicationId,
  ]);
  const certifications = await dbQuery(
    "SELECT * FROM candidate_certifications WHERE application_id = ?",
    [applicationId],
  );
  const answers = await dbQuery("SELECT * FROM candidate_answers WHERE application_id = ?", [
    applicationId,
  ]);

  const years = (experience as any[]).reduce(
    (total, record) =>
      total +
      Math.max(
        0,
        ((new Date(record.end_date ?? Date.now()).getTime() -
          new Date(record.start_date).getTime()) /
          3.154e10),
      ),
    0,
  );

  const scored = scoreApplication(
    {
      min_qualification: campaign.min_qualification as string | null,
      min_experience_years: Number(campaign.min_experience_years ?? 0),
      required_skills: JSON.parse(campaign.required_skills ?? "[]") as string[],
      required_certifications: JSON.parse(campaign.required_certifications ?? "[]") as string[],
    },
    {
      highest_qualification: (education as any[]).sort(
        (a, b) => (b.qualification ?? "").length - (a.qualification ?? "").length,
      )[0]?.qualification ?? null,
      years_experience: Math.round(years * 10) / 10,
      skills: (skills as any[]).map((s) => s.skill),
      certifications: (certifications as any[]).map((c) => c.certification),
      work_fields: (experience as any[]).map((e) => e.field).filter(Boolean),
      referee_count: 0,
      answers: Object.fromEntries((answers as any[]).map((a) => [a.question_id ?? a.question_text, a.answer])),
      questions: [],
    },
  );

  await dbExecute(
    "UPDATE applications SET score = ?, recommendation = ?, score_breakdown = ?, eligibility_status = ? WHERE id = ?",
    [
      scored.total,
      scored.recommendation,
      JSON.stringify(scored.breakdown),
      scored.eligible ? "eligible" : "not_eligible",
      applicationId,
    ],
  );

  return { applicationId, score: scored.total, recommendation: scored.recommendation };
});

scoringProcessor.on("completed", (job) => {
  console.log(`[Scoring Worker] Completed: ${job.id}`);
});

scoringProcessor.on("failed", (job, err) => {
  console.error(`[Scoring Worker] Failed: ${job?.id}`, err);
});

export default scoringProcessor;
