/**
 * ORS Requirement Groups — the core data model for the new scoring engine.
 *
 * A "requirement group" defines a set of accepted values with a minimum
 * match count. For example:
 *   - Education group: "Must have ANY 1 of: Logistics, Supply Chain, Business Admin"
 *   - Experience group: "Must have ANY 1 of: Fleet Management, Transport Operations — min 3 years"
 *   - Skill group: "Must have ALL of: Microsoft Excel"
 *
 * Each group is marked "required" or "preferred":
 *   - Required: failing the group → INELIGIBLE
 *   - Preferred: failing the group → score penalty but still eligible
 *
 * The candidate never sees which values are required vs preferred.
 * They simply report their actual qualifications.
 */

// ─── Requirement Group ──────────────────────────────────────────────

export type RequirementLevel = "required" | "preferred";

export type RequirementGroupType =
  | "education_level"     // Minimum degree level (Bachelor's, Master's, etc.)
  | "education_field"     // Fields of study (Logistics, Supply Chain, etc.)
  | "experience_area"     // Work experience areas (Fleet Management, Transport, etc.)
  | "experience_years"    // Minimum years of experience
  | "skill_critical"      // Must have ALL of these skills
  | "skill_required"      // Must have ANY X of these skills
  | "skill_preferred"     // Bonus points for these skills
  | "certification"       // Required certifications
  | "industry"            // Industry experience
  | "location";           // Country/location requirement

export type RequirementGroup = {
  /** Unique ID for this group */
  id: string;
  /** Human-readable name (e.g., "Operational Experience", "Critical Skills") */
  name: string;
  /** What type of requirement this is */
  type: RequirementGroupType;
  /** Required = failing makes candidate ineligible. Preferred = score penalty only. */
  level: RequirementLevel;
  /** Accepted values — the candidate must match at least `minMatch` of these */
  acceptedValues: string[];
  /** Minimum number of accepted values the candidate must have (default: 1) */
  minMatch: number;
  /** For experience groups: minimum years required */
  minYears?: number;
  /** For education groups: minimum qualification level */
  minLevel?: string;
  /** Description shown to the recruiter (never to the candidate) */
  description?: string;
  /** Weight multiplier for scoring when this group is preferred (0-1) */
  weightMultiplier?: number;
};

// ─── Campaign Scoring Model ─────────────────────────────────────────

export type ScoringWeights = {
  education: number;       // Default: 20
  experience: number;      // Default: 25
  skills: number;          // Default: 25
  certifications: number;  // Default: 10
  position_relevance: number; // Default: 10
  industry: number;        // Default: 5
  location: number;        // Default: 5
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  education: 20,
  experience: 25,
  skills: 25,
  certifications: 10,
  position_relevance: 10,
  industry: 5,
  location: 5,
};

export type CampaignScoringModel = {
  /** All requirement groups defined by the recruiter */
  requirementGroups: RequirementGroup[];
  /** Scoring weights for each dimension */
  weights: ScoringWeights;
  /** When true, experience outside the recency window blends down */
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

// ─── Eligibility & Score Results ────────────────────────────────────

export type EligibilityResult = {
  /** Is the candidate eligible to proceed? */
  eligible: boolean;
  /** All eligibility gates evaluated */
  gates: EligibilityGate[];
};

export type EligibilityGate = {
  /** Name of the requirement group */
  name: string;
  /** Did the candidate pass this gate? */
  passed: boolean;
  /** Why they passed or failed */
  reason: string;
  /** Was this a hard requirement or preferred? */
  level: RequirementLevel;
};

export type ScoreBreakdown = {
  dimension: string;
  label: string;
  score: number;
  max: number;
  /** Individual requirement group scores within this dimension */
  groups?: GroupScore[];
};

export type GroupScore = {
  groupId: string;
  groupName: string;
  passed: boolean;
  score: number;
  max: number;
  /** How many of the accepted values the candidate matched */
  matched: number;
  /** How many were required */
  required: number;
};

export type ScoringResult = {
  /** Final score 0-100 */
  total: number;
  /** Breakdown by dimension */
  breakdown: ScoreBreakdown[];
  /** Eligibility assessment */
  eligibility: EligibilityResult;
  /** Human-readable recommendation */
  recommendation: string;
  /** Evidence list */
  reasons: string[];
  /** Score version for auditability */
  scoreVersion: number;
};

// ─── Candidate Input for New Engine ─────────────────────────────────

export type CandidateScoringInput = {
  /** Highest qualification level */
  highestQualification?: string;
  /** Fields of study */
  fieldsOfStudy?: string[];
  /** Years of total experience */
  yearsExperience?: number;
  /** Work experience entries with titles and fields */
  experienceEntries?: {
    title: string;
    field?: string;
    years?: number;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
  }[];
  /** Skills the candidate has */
  skills?: string[];
  /** Certifications held */
  certifications?: string[];
  /** Country */
  country?: string;
  /** Industry */
  industry?: string;
  /** Question answers */
  answers?: Record<string, string | string[]>;
};

// ─── Helper: Create Requirement Group ───────────────────────────────

let _groupCounter = 0;

export function createRequirementGroup(
  partial: Partial<RequirementGroup> & { name: string; type: RequirementGroupType },
): RequirementGroup {
  return {
    id: partial.id || `rg_${++_groupCounter}_${Date.now()}`,
    level: partial.level || "required",
    acceptedValues: partial.acceptedValues || [],
    minMatch: partial.minMatch || 1,
    ...partial,
  };
}

// ─── Helper: Default Groups for a Campaign ──────────────────────────

export function defaultRequirementGroups(): RequirementGroup[] {
  return [
    createRequirementGroup({
      name: "Education Level",
      type: "education_level",
      level: "required",
      acceptedValues: ["Bachelor's Degree"],
      minMatch: 1,
      minLevel: "Bachelor's Degree",
    }),
    createRequirementGroup({
      name: "Field of Study",
      type: "education_field",
      level: "preferred",
      acceptedValues: [],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Professional Experience",
      type: "experience_area",
      level: "required",
      acceptedValues: [],
      minMatch: 1,
      minYears: 3,
    }),
    createRequirementGroup({
      name: "Required Skills",
      type: "skill_required",
      level: "required",
      acceptedValues: [],
      minMatch: 3,
    }),
    createRequirementGroup({
      name: "Preferred Skills",
      type: "skill_preferred",
      level: "preferred",
      acceptedValues: [],
      minMatch: 1,
    }),
  ];
}
