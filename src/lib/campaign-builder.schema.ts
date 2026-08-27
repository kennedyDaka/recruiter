import { z } from "zod";

export const answerOptionSchema = z.object({
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(160),
  points: z.number().min(0).max(100),
  disqualifying: z.boolean().optional().default(false),
});

export const builderQuestionSchema = z.object({
  key: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1).max(400),
  type: z.string().trim().min(1).max(40),
  options: z.array(answerOptionSchema).max(40).default([]),
  mandatory: z.boolean().default(false),
  condition: z
    .object({ key: z.string().max(120), equals: z.string().max(160) })
    .nullable()
    .optional(),
});

/** The builder blob is stored verbatim on the campaign for later editing. */
export const saveCampaignSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  builder: z.record(z.string(), z.unknown()),
  name: z.string().trim().min(1).max(140),
  jobTitle: z.string().trim().min(1).max(140),
  jobDescription: z.string().trim().max(20000),
  hiringReason: z.string().trim().max(80).default(""),
  positions: z.number().int().min(1).max(500).default(1),
  location: z.string().trim().max(200).default(""),
  employmentType: z.string().trim().max(60).default(""),
  minQualification: z.string().trim().max(80).default(""),
  minExperienceYears: z.number().int().min(0).max(50).default(0),
  requiredSkills: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  requiredCertifications: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  responsibilities: z.array(z.string().trim().min(1).max(300)).max(200).default([]),
  requiredDocuments: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  salaryCurrency: z.string().trim().max(10).default("MWK"),
  startDate: z.string().trim().max(20).default(""),
  closingDate: z.string().trim().max(20).default(""),
  weights: z.record(z.string(), z.number()),
  questions: z.array(builderQuestionSchema).max(80).default([]),
  scoringModel: z.record(z.string(), z.unknown()).nullable().optional(),
  // Branding
  logoData: z.string().max(5_000_000).nullable().optional(),
  brandColor: z.string().trim().max(20).default("#2563eb"),
  brandFont: z.string().trim().max(60).default("Inter"),
  companyName: z.string().trim().max(200).default(""),
});

export type SaveCampaignInput = z.infer<typeof saveCampaignSchema>;

export const publishSchema = z.object({ campaignId: z.string().uuid() });
export const idSchema = z.object({ campaignId: z.string().uuid() });
