/**
 * CV Analysis — sends extracted CV text to Gemini and returns
 * structured candidate information for the ORS scoring engine.
 *
 * Flow:
 *   Extracted text → Gemini → Structured candidate data → Normalize → Scoring engine
 */

import { getAiProvider } from "./provider";
import {
  normalizeGeminiToScoringInput,
  type GeminiCandidateOutput,
} from "./normalization";
import { AI_ERROR_CODES } from "./config";
import type { CandidateScoringInput } from "../ors-requirements";

// ─── Types ────────────────────────────────────────────────────────

export interface CvAnalysisResult {
  success: boolean;
  scoringInput?: CandidateScoringInput;
  candidateData?: GeminiCandidateOutput;
  candidateMeta: {
    name: string | undefined;
    email: string | undefined;
    phone: string | undefined;
  };
  rawResponse: string | undefined;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// ─── Prompts ──────────────────────────────────────────────────────

const CV_SYSTEM_INSTRUCTION = `You are an expert CV/resume parser. Analyze the provided CV text and extract structured candidate information.

Return a JSON object with the following structure:

{
  "candidate": {
    "name": "Full name of the candidate",
    "email": "Email address",
    "phone": "Phone number"
  },
  "education": [
    {
      "qualification": "Highest qualification name (e.g. Bachelor's Degree, Diploma, Certificate)",
      "institution": "University or institution name",
      "field_of_study": "Field of study (e.g. Business Administration, Computer Science)",
      "start_year": 2018,
      "end_year": 2022
    }
  ],
  "experience": [
    {
      "employer": "Company name",
      "position": "Job title",
      "field": "Industry or field of work",
      "start_date": "YYYY-MM or YYYY-MM-DD",
      "end_date": "YYYY-MM or YYYY-MM-DD or null if current",
      "is_current": false,
      "responsibilities": ["Key responsibility 1", "Key responsibility 2"]
    }
  ],
  "skills": ["Skill 1", "Skill 2"],
  "certifications": ["Certification 1", "Certification 2"],
  "total_experience_years": 5,
  "relevant_experience": ["Relevant area 1", "Relevant area 2"],
  "additional_information": {}
}

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- Use null for missing fields, empty arrays for empty lists.
- For qualification names, use standard forms: "Bachelor's Degree", "Master's Degree", "Diploma", "Certificate", "MSCE", etc.
- Calculate total_experience_years from actual work history dates.
- Normalize dates to YYYY-MM format when possible.
- If a field is ambiguous, make your best interpretation.
- Do not fabricate information not present in the CV.`;

const CV_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    candidate: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qualification: { type: "string" },
          institution: { type: "string" },
          field_of_study: { type: "string" },
          start_year: { type: "integer" },
          end_year: { type: "integer" },
        },
      },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          employer: { type: "string" },
          position: { type: "string" },
          field: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          is_current: { type: "boolean" },
          responsibilities: { type: "array", items: { type: "string" } },
        },
      },
    },
    skills: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
    total_experience_years: { type: "number" },
    relevant_experience: { type: "array", items: { type: "string" } },
    additional_information: { type: "object" },
  },
};

// ─── Core Function ────────────────────────────────────────────────

export async function analyzeCv(
  cvText: string,
  context?: {
    jobTitle?: string;
    requiredSkills?: string[];
  },
): Promise<CvAnalysisResult> {
  if (!cvText.trim()) {
    return {
      success: false,
      candidateMeta: { name: undefined, email: undefined, phone: undefined },
      rawResponse: undefined,
      error: {
        code: AI_ERROR_CODES.NO_USABLE_TEXT,
        message: "Empty CV text provided",
        retryable: false,
      },
    };
  }

  const provider = getAiProvider("gemini");

  let userContent = `Please analyze the following CV text and extract structured candidate information:\n\n${cvText}`;

  if (context?.jobTitle) {
    userContent += `\n\nContext: This CV is being evaluated for a "${context.jobTitle}" position.`;
  }

  if (context?.requiredSkills?.length) {
    userContent += `\nRequired skills for the role: ${context.requiredSkills.join(", ")}`;
  }

  const response = await provider.generate({
    systemInstruction: CV_SYSTEM_INSTRUCTION,
    userContent,
    responseSchema: CV_RESPONSE_SCHEMA,
  });

  if (!response.success) {
    return {
      success: false,
      candidateMeta: { name: undefined, email: undefined, phone: undefined },
      rawResponse: response.text,
      error: {
        code: response.error?.code ?? AI_ERROR_CODES.INVALID_RESPONSE,
        message: response.error?.message ?? "Unknown Gemini error",
        retryable: response.error?.retryable ?? true,
      },
    };
  }

  const geminiOutput = response.data as GeminiCandidateOutput;
  const validation = validateCvOutput(geminiOutput);
  if (!validation.valid) {
    return {
      success: false,
      candidateMeta: { name: undefined, email: undefined, phone: undefined },
      rawResponse: response.text,
      error: {
        code: AI_ERROR_CODES.INVALID_RESPONSE,
        message: `Invalid AI output: ${validation.reason}`,
        retryable: true,
      },
    };
  }

  const scoringInput = normalizeGeminiToScoringInput(geminiOutput);

  return {
    success: true,
    scoringInput,
    candidateData: geminiOutput,
    candidateMeta: {
      name: geminiOutput.candidate?.name,
      email: geminiOutput.candidate?.email,
      phone: geminiOutput.candidate?.phone,
    },
    rawResponse: response.text,
  };
}

// ─── Validation ───────────────────────────────────────────────────

function validateCvOutput(data: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "Response is not an object" };
  }

  const obj = data as Record<string, unknown>;

  const education = obj["education"];
  if (education && !Array.isArray(education)) {
    return { valid: false, reason: "education must be an array" };
  }

  const experience = obj["experience"];
  if (experience && !Array.isArray(experience)) {
    return { valid: false, reason: "experience must be an array" };
  }

  const skills = obj["skills"];
  if (skills && !Array.isArray(skills)) {
    return { valid: false, reason: "skills must be an array" };
  }

  const hasEducation = Array.isArray(education) && education.length > 0;
  const hasExperience = Array.isArray(experience) && experience.length > 0;
  const hasSkills = Array.isArray(skills) && skills.length > 0;

  if (!hasEducation && !hasExperience && !hasSkills) {
    return {
      valid: false,
      reason: "No education, experience, or skills extracted — CV may be unreadable",
    };
  }

  return { valid: true };
}
