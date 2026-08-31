/**
 * Vacancy Structuring — uses Gemini to convert a pasted unstructured
 * vacancy/job description into the structured ORS vacancy format.
 */

import { getAiProvider } from "./provider";
import { normalizeGeminiVacancy } from "./normalization";
import { AI_ERROR_CODES } from "./config";

// ─── Types ────────────────────────────────────────────────────────

export interface VacancyStructuringResult {
  success: boolean;
  vacancy: Record<string, unknown> | undefined;
  rawResponse: string | undefined;
  error: {
    code: string;
    message: string;
  } | undefined;
}

// ─── Prompts ──────────────────────────────────────────────────────

const VACANCY_SYSTEM_INSTRUCTION = `You are an expert HR and recruitment assistant. Your job is to analyze unstructured vacancy/job description text and extract structured information.

Given a job description or vacancy text, extract and return the following fields as JSON:

{
  "job_title": "string — The official job title",
  "department": "string — Department or division",
  "location": "string — Physical location or 'Remote' / 'Hybrid'",
  "employment_type": "string — full-time, part-time, contract, temporary, internship",
  "job_description": "string — A clean, professional summary of the role (2-3 sentences)",
  "responsibilities": ["string — Key duties and responsibilities"],
  "qualifications": ["string — Required educational qualifications"],
  "required_experience": ["string — Required work experience (e.g. '3+ years in logistics')"],
  "required_skills": ["string — Must-have technical and soft skills"],
  "preferred_skills": ["string — Nice-to-have skills"],
  "certifications": ["string — Required or preferred certifications"],
  "other_requirements": ["string — Any other requirements (language, travel, etc.)"]
}

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- If a field is not mentioned, use an empty string or empty array.
- Keep extracted values concise but accurate.
- Do not fabricate information that isn't in the source text.
- Standardize common terms (e.g., "full time" → "full-time").`;

const VACANCY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    job_title: { type: "string" },
    department: { type: "string" },
    location: { type: "string" },
    employment_type: { type: "string" },
    job_description: { type: "string" },
    responsibilities: { type: "array", items: { type: "string" } },
    qualifications: { type: "array", items: { type: "string" } },
    required_experience: { type: "array", items: { type: "string" } },
    required_skills: { type: "array", items: { type: "string" } },
    preferred_skills: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
    other_requirements: { type: "array", items: { type: "string" } },
  },
  required: ["job_title", "job_description"],
};

// ─── Core Function ────────────────────────────────────────────────

export async function structureVacancy(
  rawVacancy: string,
): Promise<VacancyStructuringResult> {
  if (!rawVacancy.trim()) {
    return {
      success: false,
      vacancy: undefined,
      rawResponse: undefined,
      error: {
        code: AI_ERROR_CODES.INVALID_RESPONSE,
        message: "Empty vacancy text provided",
      },
    };
  }

  const provider = getAiProvider("gemini");

  const response = await provider.generate({
    systemInstruction: VACANCY_SYSTEM_INSTRUCTION,
    userContent: `Please structure the following vacancy/job description:\n\n${rawVacancy}`,
    responseSchema: VACANCY_RESPONSE_SCHEMA,
  });

  if (!response.success) {
    return {
      success: false,
      vacancy: undefined,
      rawResponse: response.text,
      error: response.error
        ? { code: response.error.code, message: response.error.message }
        : { code: AI_ERROR_CODES.INVALID_RESPONSE, message: "Unknown error" },
    };
  }

  const validation = validateVacancyOutput(response.data);
  if (!validation.valid) {
    return {
      success: false,
      vacancy: undefined,
      rawResponse: response.text,
      error: {
        code: AI_ERROR_CODES.INVALID_RESPONSE,
        message: `Invalid AI output: ${validation.reason}`,
      },
    };
  }

  const normalized = normalizeGeminiVacancy(response.data as Record<string, unknown>);

  return {
    success: true,
    vacancy: normalized,
    rawResponse: response.text,
    error: undefined,
  };
}

// ─── Validation ───────────────────────────────────────────────────

function validateVacancyOutput(data: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "Response is not an object" };
  }

  const obj = data as Record<string, unknown>;

  const jobTitle = obj["job_title"];
  if (!jobTitle || typeof jobTitle !== "string") {
    return { valid: false, reason: "Missing or invalid job_title" };
  }

  const jobDesc = obj["job_description"];
  if (!jobDesc || typeof jobDesc !== "string") {
    return { valid: false, reason: "Missing or invalid job_description" };
  }

  const arrayFields = [
    "responsibilities",
    "qualifications",
    "required_experience",
    "required_skills",
    "preferred_skills",
    "certifications",
    "other_requirements",
  ];

  for (const field of arrayFields) {
    const value = obj[field];
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return { valid: false, reason: `Field "${field}" must be an array` };
    }
  }

  // Reject unexpected fields
  const allowedFields = new Set([
    "job_title", "department", "location", "employment_type",
    "job_description", "responsibilities", "qualifications",
    "required_experience", "required_skills", "preferred_skills",
    "certifications", "other_requirements",
  ]);

  for (const key of Object.keys(obj)) {
    if (!allowedFields.has(key)) {
      delete obj[key];
    }
  }

  if (jobTitle && String(jobTitle).length > 200) {
    return { valid: false, reason: "job_title is too long" };
  }

  if (jobDesc && String(jobDesc).length > 5000) {
    return { valid: false, reason: "job_description is too long" };
  }

  return { valid: true };
}

export function validateVacancyForCampaign(
  vacancy: Record<string, unknown>,
): { valid: boolean; missingRequired: string[] } {
  const missingRequired: string[] = [];

  const jobTitle = vacancy["job_title"];
  if (!jobTitle || String(jobTitle).trim().length === 0) {
    missingRequired.push("job_title");
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}
