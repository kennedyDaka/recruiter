/**
 * CV Normalization Layer — converts Gemini output into ORS-compatible scoring input.
 */

import type { CandidateScoringInput } from "../ors-requirements";

// ─── Gemini Output Schema ─────────────────────────────────────────

export interface GeminiCandidateOutput {
  candidate?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  education?: Array<{
    qualification?: string;
    institution?: string;
    field_of_study?: string;
    start_year?: number | string;
    end_year?: number | string;
  }>;
  experience?: Array<{
    employer?: string;
    position?: string;
    field?: string;
    start_date?: string;
    end_date?: string;
    is_current?: boolean;
    responsibilities?: string[];
  }>;
  skills?: string[];
  certifications?: string[];
  total_experience_years?: number;
  relevant_experience?: string[];
  additional_information?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────

function normalizeQualification(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().trim();
  const mappings: [RegExp, string][] = [
    [/bachelor'?s?\s+degree/i, "Bachelor's Degree"],
    [/b\.?sc/i, "Bachelor's Degree"],
    [/b\.?ba/i, "Bachelor's Degree"],
    [/b\.?eng/i, "Bachelor's Degree"],
    [/bachelor/i, "Bachelor's Degree"],
    [/master'?s?\s+degree/i, "Master's Degree"],
    [/m\.?sc/i, "Master's Degree"],
    [/m\.?ba/i, "Master's Degree"],
    [/m\.?a\./i, "Master's Degree"],
    [/master/i, "Master's Degree"],
    [/ph\.?d/i, "Doctorate"],
    [/doctoral/i, "Doctorate"],
    [/doctorate/i, "Doctorate"],
    [/diploma/i, "Diploma"],
    [/advanced\s+diploma/i, "Advanced Diploma"],
    [/certificate/i, "Certificate"],
    [/msce/i, "MSCE"],
    [/secondary\s+school/i, "Secondary School"],
    [/high\s+school/i, "Secondary School"],
  ];
  for (const [pattern, normalized] of mappings) {
    if (pattern.test(lower)) return normalized;
  }
  return raw.trim();
}

function normalizeDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(str)) return str;
  const monthMap: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04",
    jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const match = str.match(/(\w+)\s+(\d{4})/);
  if (match) {
    const month = monthMap[match[1]!.toLowerCase()];
    if (month) return `${match[2]}-${month}`;
  }
  if (/^\d{4}$/.test(str)) return `${str}-01`;
  return str;
}

function normalizeSkill(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\bms\b/g, "microsoft")
    .replace(/\bexcel spreadsheets?\b/g, "microsoft excel")
    .replace(/\bpowerbi\b/g, "power bi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Filter out undefined values from an object for exactOptionalPropertyTypes. */
function pick<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// ─── Main Normalization ───────────────────────────────────────────

const QUAL_RANK: Record<string, number> = {
  "none": 0, "secondary school": 1, "msce": 1, "certificate": 2,
  "diploma": 3, "advanced diploma": 3, "bachelor's degree": 4,
  "postgraduate diploma": 5, "professional qualification": 5,
  "master's degree": 6, "doctorate": 7,
};

/**
 * Convert Gemini's structured CV output into the CandidateScoringInput
 * that the existing ORS scoring engine expects.
 */
export function normalizeGeminiToScoringInput(
  geminiOutput: GeminiCandidateOutput,
): CandidateScoringInput {
  // Education — build each entry using pick() to avoid passing undefined to optional props
  const education = (geminiOutput.education ?? []).map((e) => {
    const qual = normalizeQualification(e.qualification) ?? e.qualification ?? "Unknown";
    return pick({
      qualification: qual,
      institution: e.institution,
      fieldOfStudy: e.field_of_study,
      startYear: typeof e.start_year === "string" ? parseInt(e.start_year, 10) : e.start_year,
      endYear: typeof e.end_year === "string" ? parseInt(e.end_year, 10) : e.end_year,
    });
  }) as Array<{ qualification: string; institution?: string; fieldOfStudy?: string; startYear?: number; endYear?: number }>;

  // Highest qualification (copy array to avoid mutating the education list)
  const highest = [...education]
    .sort((a, b) => (QUAL_RANK[a.qualification.toLowerCase()] ?? 0) - (QUAL_RANK[b.qualification.toLowerCase()] ?? 0))
    .pop()?.qualification;

  // Experience — use pick() to avoid undefined optional props
  const experience = (geminiOutput.experience ?? []).map((e) => {
    return pick({
      title: e.position ?? "",
      employer: e.employer,
      field: e.field,
      startDate: normalizeDate(e.start_date),
      endDate: normalizeDate(e.end_date),
      isCurrent: e.is_current ?? false,
      years: undefined as number | undefined,
    });
  }) as Array<{ title: string; employer?: string; field?: string; startDate?: string; endDate?: string; isCurrent: boolean; years?: number }>;

  // Fields of study
  const fieldsOfStudy = education
    .map((e) => e.fieldOfStudy)
    .filter((f): f is string => Boolean(f && f.length > 0));

  // Skills & certifications
  const skills = (geminiOutput.skills ?? []).map(normalizeSkill).filter(Boolean);
  const certifications = (geminiOutput.certifications ?? []).map((c) => c.trim()).filter(Boolean);

  // Total experience years
  const yearsExperience = geminiOutput.total_experience_years ?? calculateYears(experience);

  // Build scoring input — use pick() to strip undefined
  return pick({
    highestQualification: highest,
    education,
    fieldsOfStudy,
    yearsExperience: Math.round(yearsExperience),
    experienceEntries: experience,
    skills,
    certifications,
    answers: {} as Record<string, string | string[]>,
  }) as CandidateScoringInput;
}

function calculateYears(
  entries: Array<{ startDate?: string; endDate?: string; isCurrent?: boolean }>,
): number {
  let totalMonths = 0;
  const now = new Date();
  for (const entry of entries) {
    const startDate = entry.startDate;
    if (!startDate) continue;
    const start = new Date(startDate);
    const endDate = entry.endDate;
    const end = entry.isCurrent ? now : endDate ? new Date(endDate) : now;
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    if (months > 0) totalMonths += months;
  }
  return totalMonths / 12;
}

// ─── Vacancy Normalization ────────────────────────────────────────

export function normalizeGeminiVacancy(
  geminiOutput: Record<string, unknown>,
): Record<string, unknown> {
  const get = (key: string) => geminiOutput[key];
  const getArr = (key: string): unknown[] => {
    const v = get(key);
    return Array.isArray(v) ? v : [];
  };
  return {
    job_title: get("job_title") ?? get("title") ?? "",
    department: get("department") ?? "",
    location: get("location") ?? "",
    employment_type: get("employment_type") ?? get("type") ?? "",
    job_description: get("job_description") ?? get("description") ?? "",
    responsibilities: getArr("responsibilities"),
    qualifications: (() => {
      const arr = getArr("qualifications");
      return arr.length > 0 ? arr : getArr("required_qualifications");
    })(),
    required_experience: getArr("required_experience"),
    required_skills: (() => {
      const arr = getArr("required_skills");
      return arr.length > 0 ? arr : getArr("skills");
    })(),
    preferred_skills: getArr("preferred_skills"),
    certifications: getArr("certifications"),
    other_requirements: getArr("other_requirements"),
  };
}
