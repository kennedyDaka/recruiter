/**
 * ORS Requirement Groups v3 — the core data model for the scoring engine.
 *
 * Architecture:
 *   1. Every requirement has 3 states: REQUIRED, PREFERRED, INFORMATIONAL
 *   2. Eligibility (PASS/FAIL/REVIEW) is separate from Score (0-100)
 *   3. Confidence (HIGH/MEDIUM/LOW) indicates how certain the system is
 *   4. Missing information → UNKNOWN, never automatically penalized
 *   5. Unknown data triggers investigation, not rejection
 *
 * The candidate never sees which values are required vs preferred.
 * They simply report their actual qualifications.
 */

// ─── Requirement States ─────────────────────────────────────────────

/** 3 states for every requirement */
export type RequirementState = "required" | "preferred" | "informational";

/** Match levels — how closely the candidate matches a requirement */
export type MatchLevel =
  | "exact"          // Perfect match (100%)
  | "very_related"   // Strong match (90%)
  | "related"        // Reasonable match (70%)
  | "weakly_related" // Some connection (30%)
  | "unrelated"      // No meaningful connection (0%)
  | "unknown";       // Cannot determine (triggers REVIEW)

/** Evidence sources — where the system got its information */
export type EvidenceSource =
  | "candidate_declaration"  // Candidate selected/typed it
  | "employment_history"     // Derived from work experience
  | "cv"                     // Extracted from uploaded CV
  | "certification"          // From certification data
  | "assessment"             // From a test or assessment
  | "recruiter_verified"     // Confirmed by recruiter
  | "api_enrichment";        // Enhanced via ISCO/O*NET/ESCO

/** Information completeness */
export type InfoPresence = "yes" | "no" | "unknown" | "not_applicable";

/** Confidence in the scoring result */
export type Confidence = "high" | "medium" | "low";

/** Operator for combining multiple values */
export type MatchOperator = "any" | "all" | "x_of";

/** Requirement group types */
export type RequirementGroupType =
  | "education_level"
  | "education_field"
  | "experience_area"
  | "experience_years"
  | "skill_critical"
  | "skill_required"
  | "skill_preferred"
  | "certification"
  | "industry"
  | "location";

// ─── Education Matching ─────────────────────────────────────────────

/** Education relevance classification */
export type EducationRelevance =
  | "exact"         // Exact field match (BSc Logistics for Logistics Manager)
  | "very_related"  // Highly related (Supply Chain Management for Fleet Manager)
  | "related"       // Related field (Business Administration for Fleet Manager)
  | "weakly_related" // Somewhat related (Accounting for Fleet Manager)
  | "unrelated"     // No connection (History for Fleet Manager)
  | "unknown";      // Cannot determine

// ─── Experience Scoring ─────────────────────────────────────────────

/** Experience relevance classification */
export type ExperienceRelevance =
  | "exact"          // Same role (Fleet Manager → Fleet Manager)
  | "directly_related" // Direct predecessor (Fleet Supervisor → Fleet Manager)
  | "strongly_related" // Highly related (Transport Coordinator → Fleet Manager)
  | "related"        // Related field (Logistics Officer → Fleet Manager)
  | "weakly_related" // Some connection (Warehouse Supervisor → Fleet Manager)
  | "unrelated"      // No connection (Sales Manager → Fleet Manager)
  | "unknown";       // Cannot determine

// ─── Skill Matching ─────────────────────────────────────────────────

/** Skill match classification */
export type SkillMatch =
  | "exact"         // Exact skill (Microsoft Excel → Microsoft Excel)
  | "equivalent"    // Equivalent skill (Google Sheets → Microsoft Excel)
  | "related"       // Related skill (Data Analysis → Microsoft Excel)
  | "partial"       // Partial overlap (Spreadsheet → Microsoft Excel)
  | "unrelated"     // No connection (Microsoft Word → Microsoft Excel)
  | "unknown";      // Cannot determine

// ─── Requirement Group ──────────────────────────────────────────────

export type RequirementGroup = {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** What type of requirement */
  type: RequirementGroupType;
  /** 3-state classification: required/preferred/informational */
  state: RequirementState;
  /** How to combine accepted values: any (OR), all (AND), x_of (at least N) */
  operator: MatchOperator;
  /** Minimum matches required (used with x_of operator) */
  minMatch: number;
  /** Accepted values the candidate must match */
  acceptedValues: string[];
  /** For experience groups: minimum years required */
  minYears?: number;
  /** For education groups: minimum qualification level */
  minLevel?: string;
  /** Weight multiplier for scoring when preferred (0-1) */
  weightMultiplier?: number;
  /** Description shown to the recruiter (never to the candidate) */
  description?: string;
};

// ─── Candidate Input ────────────────────────────────────────────────

/** A single education entry from the candidate */
export type CandidateEducation = {
  qualification: string;      // "Bachelor's Degree"
  institution?: string;       // "University of Malawi"
  fieldOfStudy?: string;      // "Logistics and Supply Chain Management"
  startYear?: number;
  endYear?: number;
  /** Was this information verified? */
  verified?: boolean;
};

/** A single work experience entry from the candidate */
export type CandidateExperience = {
  title: string;              // "Fleet Manager"
  employer?: string;          // "ABC Holdings"
  industry?: string;          // "FMCG"
  field?: string;             // "Transport & Fleet"
  startDate?: string;         // "2022-01"
  endDate?: string;           // "2026-01"
  isCurrent?: boolean;
  years?: number;
  responsibilities?: string[];
  /** Skills derived from this position */
  derivedSkills?: string[];
};

/** A skill declaration from the candidate */
export type CandidateSkill = {
  name: string;
  /** How the candidate knows this skill */
  evidenceSource: EvidenceSource;
  /** Proficiency level if provided */
  proficiency?: "basic" | "intermediate" | "advanced" | "expert";
};

/** A certification from the candidate */
export type CandidateCertification = {
  name: string;
  issuer?: string;
  /** Expiry date if applicable */
  expiryDate?: string;
  /** Is this certification currently valid? */
  verified?: boolean;
};

/** Complete candidate scoring input */
export type CandidateScoringInput = {
  /** Highest qualification level */
  highestQualification?: string;
  /** All education entries */
  education?: CandidateEducation[];
  /** Fields of study (derived from education entries) */
  fieldsOfStudy?: string[];
  /** Years of total experience */
  yearsExperience?: number;
  /** Work experience entries */
  experienceEntries?: CandidateExperience[];
  /** Skills the candidate has */
  skills?: string[];
  /** Skills with evidence sources */
  skillsWithEvidence?: CandidateSkill[];
  /** Certifications held */
  certifications?: string[];
  /** Certifications with details */
  certificationsDetailed?: CandidateCertification[];
  /** Country */
  country?: string;
  /** Industry */
  industry?: string;
  /** Question answers */
  answers?: Record<string, string | string[]>;
  /** CV text (for evidence extraction) */
  cvText?: string;
};

// ─── Campaign Scoring Model ─────────────────────────────────────────

export type ScoringWeights = {
  education: number;
  experience: number;
  skills: number;
  certifications: number;
  position_relevance: number;
  industry: number;
  location: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  education: 20,
  experience: 30,
  skills: 25,
  certifications: 10,
  position_relevance: 10,
  industry: 5,
  location: 0,
};

export type CampaignScoringModel = {
  /** All requirement groups defined by the recruiter */
  requirementGroups: RequirementGroup[];
  /** Scoring weights for each dimension */
  weights: ScoringWeights;
  /** Recency window in years — null disables recency penalty */
  experienceRecencyYears?: number;
  /** Target occupation for position relevance scoring */
  targetOccupation?: string;
  /** Highly relevant positions */
  highlyRelevantPositions?: string[];
  /** Related positions */
  relatedPositions?: string[];
  /** Industry for industry match scoring */
  industry?: string;
};

// ─── Results ────────────────────────────────────────────────────────

export type EligibilityGate = {
  /** Name of the requirement group */
  name: string;
  /** Did the candidate pass this gate? */
  passed: boolean;
  /** Why they passed or failed */
  reason: string;
  /** Was this a hard requirement or preferred? */
  state: RequirementState;
};

export type EligibilityResult = {
  /** PASS = meets all required groups, FAIL = missing required, REVIEW = unknown data */
  eligible: boolean;
  status: "pass" | "fail" | "review";
  /** All eligibility gates evaluated */
  gates: EligibilityGate[];
  /** Reasons for the eligibility result */
  reasons: string[];
};

export type GroupScore = {
  groupId: string;
  groupName: string;
  passed: boolean;
  score: number;
  max: number;
  matched: number;
  required: number;
  matchLevel: MatchLevel;
  evidence: string[];
};

export type ScoreBreakdown = {
  dimension: string;
  label: string;
  score: number;
  max: number;
  groups: GroupScore[];
};

export type ScoringResult = {
  /** Final score 0-100 */
  total: number;
  /** Breakdown by dimension */
  breakdown: ScoreBreakdown[];
  /** Eligibility assessment */
  eligibility: EligibilityResult;
  /** Confidence in the result */
  confidence: Confidence;
  /** Human-readable recommendation */
  recommendation: string;
  /** Evidence list */
  reasons: string[];
  /** Discrepancies found */
  discrepancies?: string[];
  /** Score version for auditability */
  scoreVersion: number;
};

// ─── Helpers ────────────────────────────────────────────────────────

let _groupCounter = 0;

export function createRequirementGroup(
  partial: Partial<RequirementGroup> & { name: string; type: RequirementGroupType },
): RequirementGroup {
  // Backward compatibility: map old "level" to "state"
  const state = partial.state || (partial as any).level || "required";
  const { level: _, ...rest } = partial as any;
  return {
    ...rest,
    id: partial.id || `rg_${++_groupCounter}_${Date.now()}`,
    state,
    operator: partial.operator || "any",
    minMatch: partial.minMatch || 1,
    acceptedValues: partial.acceptedValues || [],
  };
}

export function defaultRequirementGroups(): RequirementGroup[] {
  return [
    createRequirementGroup({
      name: "Education Level",
      type: "education_level",
      state: "required",
      operator: "any",
      acceptedValues: ["Bachelor's Degree"],
      minMatch: 1,
      minLevel: "Bachelor's Degree",
    }),
    createRequirementGroup({
      name: "Field of Study",
      type: "education_field",
      state: "preferred",
      operator: "any",
      acceptedValues: [],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Professional Experience",
      type: "experience_area",
      state: "required",
      operator: "any",
      acceptedValues: [],
      minMatch: 1,
      minYears: 3,
    }),
    createRequirementGroup({
      name: "Required Skills",
      type: "skill_required",
      state: "required",
      operator: "x_of",
      acceptedValues: [],
      minMatch: 3,
    }),
    createRequirementGroup({
      name: "Preferred Skills",
      type: "skill_preferred",
      state: "preferred",
      operator: "any",
      acceptedValues: [],
      minMatch: 1,
    }),
  ];
}

// ─── Match Level Helpers ────────────────────────────────────────────

/** Convert a match ratio (0-1) to a MatchLevel */
export function ratioToMatchLevel(ratio: number): MatchLevel {
  if (ratio >= 0.9) return "exact";
  if (ratio >= 0.7) return "very_related";
  if (ratio >= 0.5) return "related";
  if (ratio >= 0.3) return "weakly_related";
  if (ratio > 0) return "unrelated";
  return "unknown";
}

/** Score multiplier for a match level */
export function matchLevelScore(level: MatchLevel): number {
  switch (level) {
    case "exact": return 1.0;
    case "very_related": return 0.9;
    case "related": return 0.7;
    case "weakly_related": return 0.3;
    case "unrelated": return 0;
    case "unknown": return 0.5; // Unknown gets middle score — triggers review
  }
}

/** Get confidence from evidence sources and data completeness */
export function calculateConfidence(
  hasData: boolean,
  evidenceCount: number,
  apiMatch: boolean,
): Confidence {
  if (!hasData) return "low";
  if (evidenceCount >= 3 && apiMatch) return "high";
  if (evidenceCount >= 2 || apiMatch) return "medium";
  return "low";
}
