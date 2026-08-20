/**
 * Operon Recruitment Standard (ORS) — deterministic scoring engine.
 *
 * This module is intentionally free of UI, database and framework imports so
 * scoring rules can evolve without touching the candidate or recruiter
 * interfaces. Everything here is a pure function.
 */

export type OrsDimension =
  | "qualification"
  | "experience"
  | "skills"
  | "position_relevance"
  | "certifications"
  | "industry"
  | "location";

export type OrsWeights = Record<OrsDimension, number>;

export type OrsThresholds = {
  excellent: number;
  strong: number;
  good: number;
  moderate: number;
};

export const DEFAULT_WEIGHTS: OrsWeights = {
  // Enhanced scoring engine: position relevance is the strongest factor,
  // followed by experience, skills, qualification, certifications,
  // industry and location.
  qualification: 15,
  experience: 20,
  skills: 20,
  position_relevance: 25,
  certifications: 10,
  industry: 5,
  location: 5,
};

export const DEFAULT_THRESHOLDS: OrsThresholds = {
  excellent: 90,
  strong: 80,
  good: 70,
  moderate: 60,
};

export const DIMENSION_LABELS: Record<OrsDimension, string> = {
  qualification: "Qualification",
  experience: "Experience",
  skills: "Technical Skills",
  position_relevance: "Position Relevance",
  certifications: "Certifications & Licences",
  industry: "Industry Experience",
  location: "Location",
};

/** Ordered qualification ladder used for deterministic comparison. */
export const QUALIFICATION_LEVELS = [
  "None",
  "Secondary School",
  "Certificate",
  "Diploma",
  "Bachelor's Degree",
  "Postgraduate Diploma",
  "Master's Degree",
  "Doctorate",
] as const;

/** Maps a computed number of years to the YEARS_OPTIONS value that matches it. */
export function yearsOptionFor(years: number): string {
  if (years >= 5) return "5+";
  if (years >= 3) return "3-5";
  if (years >= 1) return "1-2";
  if (years >= 0.5) return "<1";
  return "none";
}

/** Skill proficiency ladder — None..Expert maps to 0..1 for skills scoring. */
export const PROFICIENCY_RANK: Record<string, number> = {
  none: 0,
  basic: 0.25,
  intermediate: 0.5,
  advanced: 0.75,
  expert: 1,
};

export function proficiencyRatio(value?: string | string[] | null): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return 0;
  const normalized = raw.trim().toLowerCase();
  return PROFICIENCY_RANK[normalized] ?? 0.5;
}

export function qualificationRank(value?: string | null): number {
  if (!value) return 0;
  const aliases: Record<string, (typeof QUALIFICATION_LEVELS)[number]> = {
    "no formal qualification": "None",
    "msce / secondary": "Secondary School",
    msce: "Secondary School",
    secondary: "Secondary School",
    "advanced diploma": "Diploma",
    "professional qualification": "Postgraduate Diploma",
  };
  const normalized = value.trim().toLowerCase();
  const canonical = aliases[normalized] ?? value;
  const index = QUALIFICATION_LEVELS.findIndex(
    (level) => level.toLowerCase() === canonical.trim().toLowerCase(),
  );
  return index < 0 ? 0 : index;
}

export type ScoredQuestion = {
  question_text: string;
  question_type: string;
  options: string[];
  dimension: OrsDimension | string;
  weight: number;
  id?: string;
  answer_options?: { value: string; points: number }[];
};

export type OrsRequirements = {
  weights?: Partial<OrsWeights> | null;
  thresholds?: Partial<OrsThresholds> | null;
  min_qualification?: string | null;
  /** When true, a qualification below the minimum loses everything; when
   * false (preferred) it only loses half. Defaults to strict (required). */
  qualification_preferred?: boolean | null;
  /** Fields of study the campaign accepts for the qualification gate. */
  fields_of_study?: string[] | null;
  min_experience_years?: number | null;
  /** Fields of work (job family / experience areas) the campaign expects,
   * ordered narrowest-first: occupation, family, then ancestors. Experience
   * is graded by how close the candidate's field sits to this chain. */
  experience_fields?: string[] | null;
  /** Recency window in years. When set (> 0) experience earned outside the
   * window blends down; when null/0 recency is ignored entirely. Off by
   * default — recruiters opt in per campaign. */
  experience_recency_years?: number | null;
  required_skills?: string[] | null;
  required_certifications?: string[] | null;
  /** Countries the candidate must be in, when the campaign requires it. */
  location_countries?: string[] | null;
  competencies?: string[] | null;
  referee_count?: number | null;
  /** Target occupation title for position relevance scoring. */
  target_occupation?: string | null;
  /** ISCO job family for the target occupation. */
  target_job_family?: string | null;
  /** Highly relevant positions (exact matches). */
  highly_relevant_positions?: string[] | null;
  /** Related positions (predecessors, adjacent roles). */
  related_positions?: string[] | null;
  /** Industry for industry experience scoring. */
  industry?: string | null;
};

export type OrsCandidateInput = {
  highest_qualification?: string | null;
  years_experience?: number | null;
  skills?: string[] | null;
  certifications?: string[] | null;
  fields_of_study?: string[] | null;
  /** Fields of work attached to the candidate's experience records. */
  work_fields?: string[] | null;
  /** Years of relevant experience earned in the last 5 years (recency). */
  recent_relevant_years?: number | null;
  /** Country of the candidate (for the location gate when configured). */
  country?: string | null;
  referee_count?: number | null;
  answers?: Record<string, string | string[]> | null;
  questions?: ScoredQuestion[] | null;
  /** Candidate's position history for career progression scoring. */
  position_history?: CandidatePosition[] | null;
  /** Industry the candidate has worked in. */
  industry?: string | null;
};

/** A single position in the candidate's career history. */
export type CandidatePosition = {
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  /** Field of work / industry for this position. */
  field?: string | null;
};

export type OrsBreakdown = {
  dimension: OrsDimension;
  label: string;
  score: number;
  max: number;
};

export type OrsRecommendation =
  | "Excellent Match"
  | "Strong Match"
  | "Good Match"
  | "Moderate Match"
  | "Weak Match";

export type EligibilityGate = {
  name: string;
  passed: boolean;
  reason: string;
};

export type OrsResult = {
  total: number;
  breakdown: OrsBreakdown[];
  recommendation: OrsRecommendation;
  /** Hard-requirement gates evaluated before the weighted score. A failed
   * gate means the candidate should not be shortlisted regardless of score. */
  eligibility: EligibilityGate[];
  eligible: boolean;
  /** Human-readable evidence list backing the score (✓ / △ items). */
  reasons: string[];
  /** Bumped whenever scoring rules change; stored for auditability. */
  score_version: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Education level scoring — how the candidate's qualification level compares
 * to the required minimum. Exceeding the requirement earns full credit;
 * meeting it earns high credit; partial matches earn reduced credit.
 */
function educationLevelScore(
  candidateRank: number,
  requiredRank: number,
): number {
  if (requiredRank === 0) {
    // No minimum set: any qualification earns full credit.
    return candidateRank > 0 ? 1 : 0.5;
  }
  if (candidateRank >= requiredRank) {
    // Meets or exceeds: full credit. The excess rank adds a small bonus
    // (up to 10%) to reward higher qualifications.
    const excess = Math.min(candidateRank - requiredRank, 3);
    return clamp(1 + excess * 0.033, 1, 1.1);
  }
  // Below minimum: credit scales with how close they are.
  const gap = requiredRank - candidateRank;
  if (gap === 1) return 0.6; // One level below (e.g. Diploma when Bachelor's required)
  if (gap === 2) return 0.3; // Two levels below
  return 0.1; // Three or more levels below
}

/**
 * Field of study relevance scoring — how well the candidate's field matches
 * the campaign's preferred fields.
 */
function fieldRelevanceScore(
  candidateFields: string[],
  expectedFields: string[],
): number {
  if (!expectedFields.length) return 1; // No field preference: full credit
  if (!candidateFields.length) return 0.3; // No field recorded: partial credit

  const normalisedExpected = expectedFields.map((f) => f.trim().toLowerCase());
  const normalisedCandidate = candidateFields.map((f) => f.trim().toLowerCase());

  // Check for exact match
  for (const expected of normalisedExpected) {
    for (const candidate of normalisedCandidate) {
      if (expected === candidate) return 1;
    }
  }

  // Check for high overlap (related field)
  for (const expected of normalisedExpected) {
    const expectedTerms = normaliseTerms(expected);
    for (const candidate of normalisedCandidate) {
      const candidateTerms = normaliseTerms(candidate);
      const overlap = expectedTerms.filter((t) => candidateTerms.includes(t)).length;
      if (overlap / Math.max(expectedTerms.length, 1) >= 0.75) return 0.8; // Highly related
      if (overlap / Math.max(expectedTerms.length, 1) >= 0.5) return 0.6; // Related
    }
  }

  return 0.3; // Weakly related or unrelated
}

/**
 * Position relevance scoring — how well a candidate's position matches the
 * target occupation. Uses taxonomy-based matching when available, falling
 * back to keyword similarity.
 */
function positionRelevanceScore(
  candidatePosition: string,
  targetOccupation: string | null,
  highlyRelevantPositions: string[],
  relatedPositions: string[],
): number {
  const normalisedCandidate = candidatePosition.trim().toLowerCase();
  const normalisedTarget = targetOccupation?.trim().toLowerCase() ?? "";

  // Check highly relevant positions — exact match first, then strong term overlap
  for (const pos of highlyRelevantPositions) {
    const normalisedPos = pos.trim().toLowerCase();
    if (normalisedCandidate === normalisedPos) return 1;
    // Strong overlap (e.g. "Fleet Supervisor" vs "Fleet Manager" share "fleet")
    const overlap = termOverlap(normalisedPos, normalisedCandidate);
    if (overlap >= 0.75) return 0.95; // Nearly identical titles
    if (overlap >= 0.5) return 0.85;  // Same core role, different level/type
  }

  // Check related positions — same approach
  for (const pos of relatedPositions) {
    const normalisedPos = pos.trim().toLowerCase();
    if (normalisedCandidate === normalisedPos) return 0.85;
    const overlap = termOverlap(normalisedPos, normalisedCandidate);
    if (overlap >= 0.75) return 0.75; // Strong overlap with related position
    if (overlap >= 0.5) return 0.6;   // Moderate overlap
  }

  // Check target occupation match — use bidirectional term overlap so
  // "Logistics Officer" matches "Fleet Manager" if they share keywords.
  if (normalisedTarget) {
    const overlap = termOverlap(normalisedTarget, normalisedCandidate);
    const reverseOverlap = termOverlap(normalisedCandidate, normalisedTarget);
    const bestOverlap = Math.max(overlap, reverseOverlap);
    if (bestOverlap >= 0.75) return 0.9;  // Direct predecessor
    if (bestOverlap >= 0.5) return 0.7;   // Highly related
    if (bestOverlap >= 0.33) return 0.5;  // Related (shared domain)
    if (bestOverlap >= 0.2) return 0.3;   // Weakly related
  }

  // Check individual keyword presence — e.g. "Fleet" in both titles
  if (normalisedTarget) {
    const targetTerms = normaliseTerms(normalisedTarget);
    const candidateTerms = normaliseTerms(normalisedCandidate);
    const sharedCore = targetTerms.filter((t) => candidateTerms.includes(t));
    if (sharedCore.length >= 1 && sharedCore.length >= targetTerms.length * 0.5) {
      return 0.4; // Shares significant domain keywords
    }
  }

  return 0.1; // Weakly related or unrelated
}

/**
 * Career progression score — evaluates the candidate's entire position
 * history with recency weighting. More recent relevant experience
 * contributes more to the score.
 */
function careerProgressionScore(
  positionHistory: CandidatePosition[],
  targetOccupation: string | null,
  highlyRelevantPositions: string[],
  relatedPositions: string[],
  recencyWindowYears: number,
): { score: number; details: string[] } {
  if (!positionHistory.length) return { score: 0, details: [] };

  const now = new Date();
  const details: string[] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;

  // Sort positions by recency (most recent first)
  const sorted = [...positionHistory].sort((a, b) => {
    const aEnd = a.is_current ? now : (a.end_date ? new Date(a.end_date) : new Date(0));
    const bEnd = b.is_current ? now : (b.end_date ? new Date(b.end_date) : new Date(0));
    return bEnd.getTime() - aEnd.getTime();
  });

  for (let i = 0; i < sorted.length; i++) {
    const position = sorted[i]!;

    // Position relevance score (always computed, even without dates)
    const relevance = positionRelevanceScore(
      position.title,
      targetOccupation,
      highlyRelevantPositions,
      relatedPositions,
    );

    // Positions without dates: give relevance-only credit (50% of full)
    if (!position.start_date) {
      totalWeightedScore += relevance * 0.5;
      totalWeight += 1;
      if (i < 3 && relevance >= 0.3) {
        details.push(`${position.title} (${Math.round(relevance * 100)}% relevant)`);
      }
      continue;
    }

    const start = new Date(position.start_date);
    const end = position.is_current ? now : (position.end_date ? new Date(position.end_date) : now);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      // Invalid dates — still give relevance-only credit
      totalWeightedScore += relevance * 0.5;
      totalWeight += 1;
      continue;
    }

    const months = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const years = months / 12;
    if (years < 0.25) continue; // Skip very short tenures

    // Recency weight: more recent positions get higher weight
    // Positions within the recency window get full weight;
    // older positions get reduced weight
    const positionEnd = position.is_current ? now : (position.end_date ? new Date(position.end_date) : now);
    const yearsSinceEnd = (now.getTime() - positionEnd.getTime()) / (1000 * 60 * 60 * 24 * 365);
    let recencyWeight = 1;
    if (recencyWindowYears > 0 && yearsSinceEnd > recencyWindowYears) {
      // Blend down for positions outside the recency window
      recencyWeight = Math.max(0.3, 1 - (yearsSinceEnd - recencyWindowYears) * 0.1);
    }

    // Duration weight: longer tenures contribute more
    const durationWeight = Math.min(years / 3, 1); // Cap at 3 years for full credit

    // Combined weight for this position
    const weight = relevance * recencyWeight * durationWeight;
    totalWeightedScore += weight;
    totalWeight += 1;

    // Add to details for top 3 positions
    if (i < 3 && relevance >= 0.5) {
      details.push(`${position.title} (${Math.round(years * 10) / 10} years, ${Math.round(relevance * 100)}% relevant)`);
    }
  }

  if (totalWeight === 0) return { score: 0, details };

  // Score is the average relevance across positions, weighted by duration and recency
  const score = clamp(totalWeightedScore / Math.max(totalWeight, 1), 0, 1);
  return { score, details };
}

function normaliseList(list?: string[] | null) {
  return (list ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function normaliseTerms(value: string) {
  return value
    .toLowerCase()
    .replace(/\bms\b/g, "microsoft")
    .replace(/\bexcel spreadsheets?\b/g, "microsoft excel")
    .replace(/\bpowerbi\b/g, "power bi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 1 && !["and", "the", "for", "with", "of"].includes(term));
}

/**
 * Token-overlap between a required and a held catalog value (0..1). 1 means
 * the normalized terms are identical; lower values mean more of the required
 * words are absent from the held value.
 */
function termOverlap(requiredValue: string, heldValue: string): number {
  const required = normaliseTerms(requiredValue);
  const held = normaliseTerms(heldValue);
  if (!required.length || !held.length) return 0;
  if (required.join(" ") === held.join(" ")) return 1;
  const heldTerms = new Set(held);
  return required.filter((term) => heldTerms.has(term)).length / required.length;
}

/** A controlled word match for catalog values without semantic or AI inference. */
function listEntryMatches(requiredValue: string, heldValue: string) {
  return termOverlap(requiredValue, heldValue) >= 0.75;
}

/**
 * Skill-match tiers, per the Missing Data design — never a silent 0:
 *   Level 1  exact / normalized equivalent          → 1.00
 *   Level 2  related skill (partial word overlap)   → 0.65
 *   Level 3  no relationship on record              → 0 (flagged "requires review")
 *
 * "Unknown ≠ unqualified": a required skill the candidate didn't record is
 * surfaced as a review item rather than quietly dropping the score.
 */
function skillRelevance(requiredValue: string, heldValue: string): number {
  const overlap = termOverlap(requiredValue, heldValue);
  if (overlap >= 0.75) return 1;
  if (overlap >= 0.4) return 0.65;
  return 0;
}

/** Points awarded for a single answer, expressed as a 0..1 ratio of its weight. */
export function answerRatio(question: ScoredQuestion, answer?: string | string[]): number {
  if (answer === undefined || answer === null) return 0;
  const options = question.options ?? [];
  const scoredOptions = question.answer_options ?? [];

  if (scoredOptions.length) {
    const selected = Array.isArray(answer) ? answer : [answer];
    const points = selected.map(
      (value) => scoredOptions.find((option) => option.value === value)?.points ?? 0,
    );
    const maxPoints = Math.max(...scoredOptions.map((option) => option.points), 0);
    if (maxPoints > 0) {
      const earned =
        question.question_type === "multiple_choice"
          ? points.reduce((sum, value) => sum + value, 0)
          : Math.max(...points, 0);
      const possible =
        question.question_type === "multiple_choice"
          ? scoredOptions.reduce((sum, option) => sum + Math.max(option.points, 0), 0)
          : maxPoints;
      return clamp(earned / Math.max(possible, 1), 0, 1);
    }
  }

  switch (question.question_type) {
    case "yes_no":
      return String(answer).toLowerCase() === "yes" ? 1 : 0;
    case "single_choice":
    case "dropdown": {
      const index = options.indexOf(String(answer));
      if (index < 0) return 0;
      if (options.length <= 1) return 1;
      return 1 - index / (options.length - 1);
    }
    case "multiple_choice": {
      const picked = Array.isArray(answer) ? answer : [answer];
      const meaningful = picked.filter((option) => {
        const lowered = option.toLowerCase();
        return lowered !== "none" && lowered !== "not applicable";
      });
      if (options.length === 0) return meaningful.length > 0 ? 1 : 0;
      return clamp(meaningful.length / Math.max(1, options.length - 1), 0, 1);
    }
    case "number": {
      const numeric = Number(answer);
      return Number.isFinite(numeric) && numeric > 0 ? 1 : 0;
    }
    case "long_text":
      return String(answer).trim().length >= 40 ? 1 : String(answer).trim().length > 0 ? 0.5 : 0;
    case "short_text":
    case "date":
    default:
      return String(answer).trim().length > 0 ? 1 : 0;
  }
}

/**
 * How relevant a candidate's field of work is to the campaign's expected
 * ISCO chain. `expectedFields` is ordered narrowest-first (occupation,
 * family, ancestors), so a match at index 0 is the exact role, index 1 the
 * family, deeper indexes progressively more senior ancestors.
 */
function experienceRelevance(expectedFields: string[], heldFields: string[]): number {
  if (!expectedFields.length) return 1;
  if (!heldFields.length) return 0;
  const expected = expectedFields.map(normaliseTerms);
  let best = 0;
  for (const rawField of heldFields) {
    const held = normaliseTerms(rawField);
    if (!held.length) continue;
    let fieldBest = 0;
    expected.forEach((terms, index) => {
      if (!terms.length) return;
      const exact = terms.join(" ") === held.join(" ");
      if (exact) {
        // Index 0 is the occupation itself (100%), the family (index 1) 90%,
        // ancestors scale down from 80%.
        fieldBest = Math.max(fieldBest, index === 0 ? 1 : index === 1 ? 0.9 : Math.max(0.6, 0.8 - (index - 1) * 0.1));
        return;
      }
      const heldSet = new Set(held);
      const overlap = terms.filter((term) => heldSet.has(term)).length;
      if (overlap / terms.length >= 0.75) fieldBest = Math.max(fieldBest, 0.5);
    });
    best = Math.max(best, fieldBest);
  }
  return best;
}

/**
 * The ORS scoring engine — the heart of the ATS. Evaluates the candidate
 * against the campaign's requirements deterministically: hard-requirement
 * eligibility gates first, then a weighted 0-100 match score. The job
 * determines the scoring; the candidate never does.
 *
 * Enhanced scoring with:
 * - Position relevance (25% weight)
 * - Experience with recency weighting (20% weight)
 * - Skills matching (20% weight)
 * - Qualification with field relevance (15% weight)
 * - Certifications (10% weight)
 * - Industry experience (5% weight)
 * - Location (5% weight)
 */
export function scoreApplication(
  requirements: OrsRequirements,
  candidate: OrsCandidateInput,
): OrsResult {
  const suppliedWeights = (requirements.weights ?? {}) as Record<string, number>;
  const weights: OrsWeights = {
    qualification: suppliedWeights["qualification"] ?? DEFAULT_WEIGHTS.qualification,
    experience: suppliedWeights["experience"] ?? DEFAULT_WEIGHTS.experience,
    skills: suppliedWeights["skills"] ?? DEFAULT_WEIGHTS.skills,
    position_relevance: suppliedWeights["position_relevance"] ?? DEFAULT_WEIGHTS.position_relevance,
    certifications: suppliedWeights["certifications"] ?? DEFAULT_WEIGHTS.certifications,
    industry: suppliedWeights["industry"] ?? DEFAULT_WEIGHTS.industry,
    location: suppliedWeights["location"] ?? DEFAULT_WEIGHTS.location,
  };
  const thresholds: OrsThresholds = { ...DEFAULT_THRESHOLDS, ...(requirements.thresholds ?? {}) };

  // --- Question driven dimensions -----------------------------------------
  const questionTotals: Record<string, { earned: number; possible: number }> = {};
  for (const question of candidate.questions ?? []) {
    const rawDimension = question.dimension ?? "knowledge";
    // Map question dimensions to scoring dimensions.
    const dimension =
      rawDimension === "job_experience"
        ? "experience"
        : rawDimension === "certification" || rawDimension === "license"
          ? "certifications"
          : rawDimension === "availability"
            ? "location"
            : rawDimension === "skills"
              ? "skills"
              : rawDimension === "qualification"
                ? "qualification"
                : rawDimension;
    const bucket = (questionTotals[dimension] ??= { earned: 0, possible: 0 });
    const weight = question.weight > 0 ? question.weight : 1;
    bucket.possible += weight;
    bucket.earned +=
      weight * answerRatio(question, candidate.answers?.[question.id ?? question.question_text]);
  }

  const ratioFor = (dimension: OrsDimension, fallback: number) => {
    const bucket = questionTotals[dimension];
    if (!bucket || bucket.possible === 0) return fallback;
    return clamp(bucket.earned / bucket.possible, 0, 1);
  };

  const reasons: string[] = [];
  const eligibility: EligibilityGate[] = [];

  // --- Eligibility gates (hard requirements, evaluated first) -------------
  const requiredRank = qualificationRank(requirements.min_qualification);
  const candidateRank = qualificationRank(candidate.highest_qualification);
  const qualificationPreferred = requirements.qualification_preferred === true;
  if (requiredRank > 0) {
    if (candidateRank >= requiredRank) {
      eligibility.push({
        name: "Qualification",
        passed: true,
        reason: `${candidate.highest_qualification ?? "No qualification"} meets the ${requirements.min_qualification} minimum`,
      });
    } else if (qualificationPreferred) {
      eligibility.push({
        name: "Qualification",
        passed: true,
        reason: `Below the preferred ${requirements.min_qualification} minimum — half credit`,
      });
    } else {
      eligibility.push({
        name: "Qualification",
        passed: false,
        reason: `Requires ${requirements.min_qualification}; candidate has ${candidate.highest_qualification ?? "none"}`,
      });
    }
  }

  const requiredYears = requirements.min_experience_years ?? 0;
  const years = candidate.years_experience ?? 0;
  if (requiredYears > 0) {
    if (years >= requiredYears) {
      eligibility.push({
        name: "Experience",
        passed: true,
        reason: `${years} year${years === 1 ? "" : "s"} meets the ${requiredYears} year minimum`,
      });
    } else {
      eligibility.push({
        name: "Experience",
        passed: false,
        reason: `Requires ${requiredYears} years; candidate has ${years} year${years === 1 ? "" : "s"}`,
      });
    }
  }

  const requiredCerts = normaliseList(requirements.required_certifications);
  const heldCerts = new Set(normaliseList(candidate.certifications));
  const missingCerts = requiredCerts.filter((cert) => !heldCerts.has(cert));
  if (requiredCerts.length) {
    eligibility.push({
      name: "Certifications",
      passed: missingCerts.length === 0,
      reason: missingCerts.length
        ? `Missing: ${missingCerts.join(", ")}`
        : "All required certifications held",
    });
  }

  const requiredCountries = normaliseList(requirements.location_countries);
  if (requiredCountries.length) {
    const heldCountry = normaliseList([candidate.country ?? ""])[0] ?? "";
    const locationOk = requiredCountries.some((country) =>
      listEntryMatches(country, heldCountry),
    );
    eligibility.push({
      name: "Location",
      passed: locationOk,
      reason: locationOk
        ? `Based in ${candidate.country}`
        : `Located outside accepted countries (${requiredCountries.join(", ")})`,
    });
  }

  const eligible = eligibility.every((gate) => gate.passed);

  // --- Qualification (level + field relevance) ------------------------------
  let qualificationRatio: number;
  if (requiredRank === 0) {
    // No minimum set: any qualification earns full credit, none earns half.
    qualificationRatio = candidateRank > 0 ? 1 : 0.5;
  } else if (candidateRank < requiredRank) {
    // Below the minimum qualification: lose everything, or lose half when
    // the qualification was only marked "preferred" by the recruiter.
    qualificationRatio = qualificationPreferred ? 0.5 : 0;
  } else {
    // Minimum met. Use the new education level scoring.
    qualificationRatio = educationLevelScore(candidateRank, requiredRank);

    // Apply field of study relevance.
    const expectedFields = normaliseList(requirements.fields_of_study);
    if (expectedFields.length) {
      const heldFields = normaliseList(candidate.fields_of_study);
      const fieldScore = fieldRelevanceScore(heldFields, expectedFields);
      qualificationRatio *= fieldScore;

      if (fieldScore >= 0.8) {
        reasons.push(`✓ ${candidate.highest_qualification} in a relevant field of study`);
      } else if (fieldScore >= 0.6) {
        reasons.push(`△ ${candidate.highest_qualification} — related field of study`);
      } else {
        reasons.push(`△ ${candidate.highest_qualification} — field of study not listed`);
      }
    } else {
      reasons.push(`✓ ${candidate.highest_qualification}`);
    }
  }

  // --- Experience (graded by ISCO relevance + optional recency) -------------
  const expectedExperienceFields = (requirements.experience_fields ?? []).map((field) =>
    field.trim(),
  );
  const heldWorkFields = (candidate.work_fields ?? []).map((field) => field.trim());
  const relevance = experienceRelevance(expectedExperienceFields, heldWorkFields);

  let experienceRatio: number;
  if (years < 0.5 && requiredYears > 0) {
    // No meaningful dated work history: the self-reported years answer is the
    // best available evidence.
    experienceRatio = ratioFor("experience", 0);
  } else if (requiredYears <= 0) {
    // No minimum set: credit scales with the years held and the relevance of
    // the candidate's field to the occupation's ISCO chain.
    experienceRatio = clamp(years / 3, 0, 1) * Math.max(0.25, relevance);
  } else if (years < requiredYears) {
    // Below the minimum years: lose everything (already a failed gate).
    experienceRatio = 0;
  } else if (relevance >= 1) {
    // Exact occupation match.
    experienceRatio = 1;
    reasons.push(`✓ ${years} years in the exact role (${expectedExperienceFields[0]})`);
  } else if (relevance >= 0.9) {
    experienceRatio = 1;
    reasons.push(`✓ ${years} years in the job family (${expectedExperienceFields[1]})`);
  } else if (relevance >= 0.6) {
    experienceRatio = 0.85;
    reasons.push(`✓ ${years} years in a related field (${heldWorkFields.join(", ")})`);
  } else if (relevance >= 0.5) {
    experienceRatio = 0.5;
    reasons.push(`△ ${years} years in an adjacent field — half credit`);
  } else {
    experienceRatio = 0.25;
    reasons.push(`△ ${years} years in a different field — reduced credit`);
  }

  // Optional recency: when the recruiter enabled it, relevant experience
  // earned inside the window counts fully and older experience blends down.
  // Off by default — stale histories rank the same as current ones unless the
  // campaign opts in.
  const recencyWindow = requirements.experience_recency_years ?? 0;
  if (recencyWindow > 0) {
    const recentRelevant = candidate.recent_relevant_years ?? years;
    const recentRatio =
      years <= 0 ? 1 : clamp(recentRelevant / Math.max(years, 1), 0.5, 1);
    if (experienceRatio > 0 && recentRatio < 1) {
      experienceRatio *= recentRatio;
      reasons.push(`△ ${Math.round(recentRelevant * 10) / 10} of ${years} relevant years are recent (last ${recencyWindow})`);
    }
  }

  // Merge: the "experience in <area>" screening questions (how the candidate
  // performed in the role — assisted, independently, supervised, managed)
  // count into the SAME experience dimension as years/relevance instead of a
  // separate "job-specific experience" bucket, so experience is never scored
  // twice. A 50/50 blend keeps both pieces of evidence in the one score.
  const jobExperienceBucket = questionTotals["experience"];
  if (jobExperienceBucket && jobExperienceBucket.possible > 0) {
    const jobExperienceRatio = clamp(
      jobExperienceBucket.earned / jobExperienceBucket.possible,
      0,
      1,
    );
    experienceRatio = clamp(0.5 * experienceRatio + 0.5 * jobExperienceRatio, 0, 1);
  }

  // --- Skills (proficiency-aware) ------------------------------------------
  const requiredSkills = normaliseList(requirements.required_skills);
  const heldSkills = normaliseList(candidate.skills);
  // Map each required skill to the candidate's proficiency from the
  // "How would you rate your ability in X?" questions when present.
  const skillsByName: Record<string, number> = {};
  for (const question of candidate.questions ?? []) {
    if ((question.dimension ?? "") !== "skills") continue;
    const match = question.question_text.match(/rate your ability in (.+?)\?$/i);
    const skillName = match?.[1]?.trim();
    if (!skillName) continue;
    skillsByName[skillName.toLowerCase()] = proficiencyRatio(
      candidate.answers?.[question.id ?? question.question_text],
    );
  }

  let skillsRatio: number;
  if (requiredSkills.length === 0) {
    skillsRatio = clamp(heldSkills.length / 6, 0, 1);
  } else {
    let earned = 0;
    const unmatchedSkills: string[] = [];
    for (const skill of requiredSkills) {
      let best = 0;
      for (const candidateSkill of heldSkills) {
        best = Math.max(best, skillRelevance(skill, candidateSkill));
      }
      const proficiency = skillsByName[skill];
      if (best >= 0.75) {
        earned += proficiency !== undefined ? proficiency : 1;
      } else if (best >= 0.4) {
        // Related skill — partial credit (60–75% band per the Missing Data
        // design). Unknown proficiency credits the full related value rather
        // than double-penalising missing data; known proficiency scales it.
        earned += (proficiency !== undefined ? proficiency : 1) * 0.65;
      } else {
        unmatchedSkills.push(skill);
      }
    }
    skillsRatio = earned / requiredSkills.length;
    if (unmatchedSkills.length) {
      reasons.push(
        `△ ${unmatchedSkills.slice(0, 3).join(", ")}` +
          `${unmatchedSkills.length > 3 ? ` +${unmatchedSkills.length - 3} more` : ""}` +
          ` — not on record, review needed`,
      );
    }
  }
  const matchedSkills = requiredSkills.filter((skill) =>
    heldSkills.some((candidateSkill) => skillRelevance(skill, candidateSkill) >= 0.75),
  );
  if (requiredSkills.length) {
    reasons.push(
      `✓ ${matchedSkills.length} of ${requiredSkills.length} required skills matched`,
    );
  }

  // --- Position Relevance (career progression scoring) ----------------------
  const positionHistory = candidate.position_history ?? [];
  const targetOccupation = requirements.target_occupation ?? null;
  const highlyRelevantPositions = (requirements.highly_relevant_positions ?? []).map((p) => p.trim());
  const relatedPositions = (requirements.related_positions ?? []).map((p) => p.trim());
  const recencyWindowForProgression = requirements.experience_recency_years ?? 5;

  const progressionResult = careerProgressionScore(
    positionHistory,
    targetOccupation,
    highlyRelevantPositions,
    relatedPositions,
    recencyWindowForProgression,
  );

  let positionRelevanceRatio = progressionResult.score;
  if (progressionResult.details.length > 0) {
    reasons.push(`✓ Top positions: ${progressionResult.details.join("; ")}`);
  }
  if (positionHistory.length === 0 && years > 0) {
    // Fallback to experience-based scoring when no position history
    positionRelevanceRatio = experienceRatio;
  }

  // --- Certifications -------------------------------------------------------
  const certRatio =
    requiredCerts.length === 0
      ? 0 // No required certs — use question-driven or held-cert scoring below
      : requiredCerts.filter((cert) => heldCerts.has(cert)).length / requiredCerts.length;
  if (requiredCerts.length) {
    reasons.push(
      certRatio >= 1
        ? "✓ All required certifications held"
        : `△ ${missingCerts.join(", ")} certification${missingCerts.length === 1 ? "" : "s"} not provided`,
    );
  }

  // --- Industry Experience -------------------------------------------------
  const candidateIndustry = candidate.industry?.trim().toLowerCase() ?? "";
  const requiredIndustry = requirements.industry?.trim().toLowerCase() ?? "";
  let industryRatio = 0.5; // Default: neutral
  if (requiredIndustry && candidateIndustry) {
    if (candidateIndustry === requiredIndustry) {
      industryRatio = 1;
      reasons.push(`✓ Industry experience in ${requirements.industry}`);
    } else {
      const candidateTerms = normaliseTerms(candidateIndustry);
      const requiredTerms = normaliseTerms(requiredIndustry);
      const overlap = candidateTerms.filter((t) => requiredTerms.includes(t)).length;
      if (overlap / Math.max(requiredTerms.length, 1) >= 0.5) {
        industryRatio = 0.7;
        reasons.push(`△ Related industry experience`);
      } else {
        industryRatio = 0.3;
        reasons.push(`△ Different industry — reduced credit`);
      }
    }
  }

  // --- Location -----------------------------------------------------------
  const locationCountries = normaliseList(requirements.location_countries);
  let locationRatio = 1; // Default: full credit when no restriction
  if (locationCountries.length) {
    const heldCountry = normaliseList([candidate.country ?? ""])[0] ?? "";
    const locationOk = requiredCountries.some((country) =>
      listEntryMatches(country, heldCountry),
    );
    locationRatio = locationOk ? 1 : 0;
    // Update the eligibility gate
    const locationGate = eligibility.find((gate) => gate.name === "Location");
    if (locationGate) {
      locationGate.passed = locationOk;
      locationGate.reason = locationOk
        ? `Based in ${candidate.country}`
        : `Located outside accepted countries (${locationCountries.join(", ")})`;
    }
  }

  // --- Question-driven certifications --------------------------------------
  // Fallback 0: when no certification questions exist and no certs are required,
  // the candidate earns nothing for this dimension unless they hold certifications
  // that the question-driven path can score.
  const certQuestionRatio = ratioFor("certifications", 0);
  const heldCertCount = normaliseList(candidate.certifications).length;
  // When no required certs and no cert questions: credit the candidate for
  // holding any certifications (up to 5 = full credit), else 0.
  const heldCertBonus = requiredCerts.length === 0 && certQuestionRatio === 0
    ? (heldCertCount > 0 ? clamp(heldCertCount / 3, 0, 1) : 0)
    : 0;
  const finalCertRatio = requiredCerts.length > 0
    ? certRatio
    : Math.max(certQuestionRatio, heldCertBonus);

  const requiredReferees = Math.max(0, requirements.referee_count ?? 0);
  const refereeRatio =
    requiredReferees === 0 ? 1 : clamp((candidate.referee_count ?? 0) / requiredReferees, 0, 1);

  const ratios: Record<OrsDimension, number> = {
    qualification: qualificationRatio,
    experience: experienceRatio,
    skills: skillsRatio,
    position_relevance: positionRelevanceRatio,
    certifications: requiredCerts.length || requiredReferees ? (finalCertRatio + refereeRatio) / 2 : finalCertRatio,
    industry: industryRatio,
    location: locationRatio,
  };

  const breakdown: OrsBreakdown[] = (Object.keys(DEFAULT_WEIGHTS) as OrsDimension[]).map(
    (dimension) => ({
      dimension,
      label: DIMENSION_LABELS[dimension],
      max: weights[dimension],
      score: Math.round(clamp(ratios[dimension], 0, 1) * weights[dimension]),
    }),
  );

  const total = breakdown.reduce((sum, item) => sum + item.score, 0);

  // Score bands — the recruiter never interprets raw numbers alone.
  const recommendation: OrsRecommendation =
    total >= thresholds.excellent
      ? "Excellent Match"
      : total >= thresholds.strong
        ? "Strong Match"
        : total >= thresholds.good
          ? "Good Match"
          : total >= thresholds.moderate
            ? "Moderate Match"
            : "Weak Match";

  return {
    total,
    breakdown,
    recommendation,
    eligibility,
    eligible,
    reasons,
    // v5: Enhanced scoring with position relevance, career progression,
    // education level scoring, industry experience, and location.
    score_version: 5,
  };
}

export function recommendationTone(recommendation?: string | null) {
  switch (recommendation) {
    case "Excellent Match":
    case "Strong Match":
      return "success" as const;
    case "Good Match":
      return "accent" as const;
    case "Moderate Match":
      return "warning" as const;
    default:
      return "muted" as const;
  }
}

/** Years of experience derived from structured work history. */
export function yearsFromExperience(
  records: { start_date?: string | null; end_date?: string | null; is_current?: boolean }[],
): number {
  const ranges: { start: number; end: number }[] = [];
  for (const record of records) {
    if (!record.start_date) continue;
    const start = new Date(record.start_date);
    const end = record.is_current || !record.end_date ? new Date() : new Date(record.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const startMonth = start.getFullYear() * 12 + start.getMonth();
    const endMonth = end.getFullYear() * 12 + end.getMonth();
    if (endMonth > startMonth) ranges.push({ start: startMonth, end: endMonth });
  }

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  const months = merged.reduce((total, range) => total + range.end - range.start, 0);
  return Math.round((months / 12) * 10) / 10;
}
