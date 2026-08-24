/**
 * ORS Scoring Engine v2 — Requirement-based eligibility + ranking.
 *
 * Architecture:
 *   CANDIDATE INPUT → RAW ANSWERS → NORMALIZATION → CLASSIFICATION → SCORING → ELIGIBILITY + SCORE
 *
 * The candidate never sees which answers give higher scores.
 * The recruiter defines the rules; the candidate simply reports their
 * actual qualifications, experience, and skills.
 *
 * Two outputs:
 *   A. Eligibility: ELIGIBLE / INELIGIBLE / REQUIRES_REVIEW
 *   B. Score: 0-100 (only meaningful for eligible candidates)
 */

import type {
  RequirementGroup,
  CampaignScoringModel,
  CandidateScoringInput,
  ScoringResult,
  EligibilityResult,
  EligibilityGate,
  ScoreBreakdown,
  GroupScore,
  ScoringWeights,
} from "./ors-requirements";
import { DEFAULT_SCORING_WEIGHTS } from "./ors-requirements";
import { normalizeOccupation, normalizeSkill, type NormalizedOccupation, type NormalizedSkill } from "./ors-normalization";

// ─── Qualification Levels ───────────────────────────────────────────

const QUAL_LEVELS: Record<string, number> = {
  "none": 0,
  "secondary school": 1,
  "msce": 1,
  "certificate": 2,
  "diploma": 3,
  "advanced diploma": 3,
  "bachelor's degree": 4,
  "bachelor": 4,
  "bba": 4,
  "bsc": 4,
  "ba": 4,
  "beng": 4,
  "postgraduate diploma": 5,
  "professional qualification": 5,
  "master's degree": 6,
  "master": 6,
  "mba": 6,
  "msc": 6,
  "ma": 6,
  "doctorate": 7,
  "phd": 7,
  "doctoral degree": 7,
};

function qualLevel(level?: string | null): number {
  if (!level) return 0;
  return QUAL_LEVELS[level.trim().toLowerCase()] ?? 0;
}

function qualName(rank: number): string {
  for (const [name, r] of Object.entries(QUAL_LEVELS)) {
    if (r === rank) return name;
  }
  return "unknown";
}

// ─── Normalization ──────────────────────────────────────────────────

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bms\b/g, "microsoft")
    .replace(/\bexcel spreadsheets?\b/g, "microsoft excel")
    .replace(/\bpowerbi\b/g, "power bi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseTerms(value: string): string[] {
  return normalise(value)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["and", "the", "for", "with", "of", "in", "a", "an"].includes(t));
}

function termOverlap(a: string, b: string): number {
  const termsA = normaliseTerms(a);
  const termsB = normaliseTerms(b);
  if (!termsA.length || !termsB.length) return 0;
  const setB = new Set(termsB);
  return termsA.filter((t) => setB.has(t)).length / termsA.length;
}

function valueMatchesAny(candidateValue: string, acceptedValues: string[]): number {
  const normalised = normalise(candidateValue);
  let best = 0;
  for (const accepted of acceptedValues) {
    const overlap = termOverlap(accepted, candidateValue);
    if (overlap >= 0.75) return 1; // Exact/near-exact match
    if (overlap >= 0.5) best = Math.max(best, 0.7); // Related
    if (overlap >= 0.33) best = Math.max(best, 0.4); // Weakly related
  }
  return best;
}

// ─── Eligibility Evaluation ─────────────────────────────────────────

function evaluateEligibility(
  groups: RequirementGroup[],
  candidate: CandidateScoringInput,
): EligibilityResult {
  const gates: EligibilityGate[] = [];

  for (const group of groups) {
    if (group.level !== "required") continue; // Only required groups create gates

    let passed = false;
    let reason = "";

    switch (group.type) {
      case "education_level": {
        const candidateRank = qualLevel(candidate.highestQualification);
        const requiredRank = group.minLevel ? qualLevel(group.minLevel) : 0;
        const requiredName = group.acceptedValues[0] || qualName(requiredRank);
        if (requiredRank === 0) {
          passed = true;
          reason = "No minimum qualification set";
        } else if (candidateRank >= requiredRank) {
          passed = true;
          reason = `${candidate.highestQualification || "No qualification"} meets the ${requiredName} minimum`;
        } else {
          passed = false;
          reason = `Requires ${requiredName}; candidate has ${candidate.highestQualification || "no qualification"}`;
        }
        break;
      }

      case "education_field": {
        if (!group.acceptedValues.length) {
          passed = true;
          reason = "No field restriction";
        } else {
          const candidateFields = (candidate.fieldsOfStudy || []).map(normalise);
          let bestMatch = 0;
          for (const field of candidateFields) {
            for (const accepted of group.acceptedValues) {
              bestMatch = Math.max(bestMatch, valueMatchesAny(field, [accepted]));
            }
          }
          passed = bestMatch >= 0.5;
          reason = passed
            ? `Field of study matches one of the accepted areas`
            : `Field of study (${candidate.fieldsOfStudy?.join(", ") || "none"}) doesn't match any accepted area`;
        }
        break;
      }

      case "experience_area": {
        const minYears = group.minYears || 0;
        const candidateYears = candidate.yearsExperience || 0;

        if (group.acceptedValues.length === 0) {
          // No specific areas required — just check years
          passed = candidateYears >= minYears;
          reason = passed
            ? `${candidateYears} years meets the ${minYears} year minimum`
            : `Requires ${minYears} years; candidate has ${candidateYears}`;
        } else {
          // Check if candidate has experience in ANY of the accepted areas
          const entries = candidate.experienceEntries || [];
          let totalRelevantYears = 0;
          for (const entry of entries) {
            const entryField = entry.field || entry.title;
            for (const accepted of group.acceptedValues) {
              if (valueMatchesAny(entryField, [accepted]) >= 0.5) {
                totalRelevantYears += entry.years || 0;
              }
            }
          }
          passed = totalRelevantYears >= minYears;
          reason = passed
            ? `${Math.round(totalRelevantYears * 10) / 10} years in relevant areas meets the ${minYears} year minimum`
            : `Requires ${minYears} years in ${group.acceptedValues.slice(0, 3).join(", ")}; candidate has ${Math.round(totalRelevantYears * 10) / 10}`;
        }
        break;
      }

      case "skill_critical": {
        const candidateSkills = (candidate.skills || []).map(normalise);
        const missing: string[] = [];
        for (const skill of group.acceptedValues) {
          const has = candidateSkills.some((s) => valueMatchesAny(s, [skill]) >= 0.5);
          if (!has) missing.push(skill);
        }
        passed = missing.length === 0;
        reason = passed
          ? "All critical skills present"
          : `Missing critical skill: ${missing.join(", ")}`;
        break;
      }

      case "skill_required": {
        const candidateSkills = (candidate.skills || []).map(normalise);
        let matched = 0;
        for (const skill of group.acceptedValues) {
          const has = candidateSkills.some((s) => valueMatchesAny(s, [skill]) >= 0.5);
          if (has) matched++;
        }
        passed = matched >= group.minMatch;
        reason = passed
          ? `${matched} of ${group.minMatch} required skills matched`
          : `Only ${matched} of ${group.minMatch} required skills found`;
        break;
      }

      case "certification": {
        const candidateCerts = (candidate.certifications || []).map(normalise);
        const missing: string[] = [];
        for (const cert of group.acceptedValues) {
          const has = candidateCerts.some((c) => valueMatchesAny(c, [cert]) >= 0.5);
          if (!has) missing.push(cert);
        }
        passed = missing.length === 0;
        reason = passed
          ? "All required certifications held"
          : `Missing certification: ${missing.join(", ")}`;
        break;
      }

      case "location": {
        if (!group.acceptedValues.length) {
          passed = true;
          reason = "No location restriction";
        } else {
          const country = normalise(candidate.country || "");
          passed = group.acceptedValues.some((v) => valueMatchesAny(country, [v]) >= 0.5);
          reason = passed
            ? `Located in ${candidate.country}`
            : `Located outside accepted countries (${group.acceptedValues.join(", ")})`;
        }
        break;
      }

      default:
        passed = true;
        reason = "No evaluation needed";
    }

    gates.push({ name: group.name, passed, reason, level: "required" });
  }

  const eligible = gates.every((g) => g.passed);
  return { eligible, gates };
}

// ─── Score Evaluation ───────────────────────────────────────────────

function evaluateDimensionScore(
  groups: RequirementGroup[],
  candidate: CandidateScoringInput,
  dimension: string,
): { score: number; max: number; groups: GroupScore[]; reasons: string[] } {
  const groupScores: GroupScore[] = [];
  const reasons: string[] = [];
  let totalScore = 0;
  let totalMax = 0;

  for (const group of groups) {
    let score = 0;
    let max = 100; // Each group scored 0-100 internally
    let matched = 0;
    let required = group.minMatch || 1;
    let passed = false;

    switch (group.type) {
      case "education_level": {
        const candidateRank = qualLevel(candidate.highestQualification);
        const requiredRank = group.minLevel ? qualLevel(group.minLevel) : 0;
        if (requiredRank === 0) {
          score = candidateRank > 0 ? 100 : 50;
        } else if (candidateRank >= requiredRank) {
          const excess = Math.min(candidateRank - requiredRank, 3);
          score = Math.min(100, 100 + excess * 5);
        } else {
          const gap = requiredRank - candidateRank;
          score = gap === 1 ? 60 : gap === 2 ? 30 : 10;
        }
        passed = score >= 60;
        reasons.push(`Education: ${candidate.highestQualification || "None"} → ${Math.round(score)}%`);
        break;
      }

      case "education_field": {
        if (!group.acceptedValues.length) {
          score = 80; // No preference: decent score
          passed = true;
        } else {
          const candidateFields = candidate.fieldsOfStudy || [];
          let bestMatch = 0;
          for (const field of candidateFields) {
            for (const accepted of group.acceptedValues) {
              bestMatch = Math.max(bestMatch, valueMatchesAny(field, [accepted]));
            }
          }
          score = Math.round(bestMatch * 100);
          passed = score >= 50;
          if (score >= 80) reasons.push(`Field of study: strong match`);
          else if (score >= 50) reasons.push(`Field of study: related match`);
          else reasons.push(`Field of study: weak match`);
        }
        break;
      }

      case "experience_area": {
        const minYears = group.minYears || 0;
        const candidateYears = candidate.yearsExperience || 0;
        const entries = candidate.experienceEntries || [];

        if (group.acceptedValues.length === 0) {
          // Generic experience: score by years
          score = minYears > 0
            ? Math.min(100, (candidateYears / minYears) * 100)
            : Math.min(100, (candidateYears / 3) * 100);
          matched = candidateYears >= minYears ? 1 : 0;
          required = 1;
        } else {
          // Score by relevance + years
          let relevantYears = 0;
          for (const entry of entries) {
            const entryField = entry.field || entry.title;
            for (const accepted of group.acceptedValues) {
              if (valueMatchesAny(entryField, [accepted]) >= 0.5) {
                relevantYears += entry.years || 0;
                matched++;
              }
            }
          }
          const yearsScore = minYears > 0
            ? Math.min(100, (relevantYears / minYears) * 100)
            : Math.min(100, (relevantYears / 3) * 100);
          const coverageScore = (matched / Math.max(group.acceptedValues.length, 1)) * 100;
          score = Math.round(yearsScore * 0.7 + coverageScore * 0.3);
          passed = relevantYears >= minYears;
          required = 1;
          matched = passed ? 1 : 0;
          reasons.push(`Experience: ${Math.round(relevantYears * 10) / 10} years relevant → ${Math.round(score)}%`);
        }
        break;
      }

      case "skill_critical": {
        const candidateSkills = (candidate.skills || []).map(normalise);
        let matchedCount = 0;
        for (const skill of group.acceptedValues) {
          const has = candidateSkills.some((s) => valueMatchesAny(s, [skill]) >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.acceptedValues.length;
        score = required > 0 ? Math.round((matched / required) * 100) : 100;
        passed = matched >= required;
        reasons.push(`Critical skills: ${matched}/${required} → ${score}%`);
        break;
      }

      case "skill_required": {
        const candidateSkills = (candidate.skills || []).map(normalise);
        let matchedCount = 0;
        for (const skill of group.acceptedValues) {
          const has = candidateSkills.some((s) => valueMatchesAny(s, [skill]) >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.minMatch || 1;
        score = required > 0 ? Math.min(100, Math.round((matched / required) * 100)) : 100;
        passed = matched >= required;
        reasons.push(`Required skills: ${matched}/${required} → ${score}%`);
        break;
      }

      case "skill_preferred": {
        const candidateSkills = (candidate.skills || []).map(normalise);
        let matchedCount = 0;
        for (const skill of group.acceptedValues) {
          const has = candidateSkills.some((s) => valueMatchesAny(s, [skill]) >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.acceptedValues.length;
        score = required > 0 ? Math.round((matched / required) * 100) : 0;
        passed = true; // Preferred skills never block eligibility
        if (score > 0) reasons.push(`Preferred skills: ${matched}/${required} bonus`);
        break;
      }

      case "certification": {
        const candidateCerts = (candidate.certifications || []).map(normalise);
        let matchedCount = 0;
        for (const cert of group.acceptedValues) {
          const has = candidateCerts.some((c) => valueMatchesAny(c, [cert]) >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.acceptedValues.length;
        score = required > 0 ? Math.round((matched / required) * 100) : 0;
        passed = matched >= required;
        if (score > 0) reasons.push(`Certifications: ${matched}/${required} → ${score}%`);
        break;
      }

      case "location": {
        if (!group.acceptedValues.length) {
          score = 100;
          passed = true;
        } else {
          const country = normalise(candidate.country || "");
          const match = group.acceptedValues.some((v) => valueMatchesAny(country, [v]) >= 0.5);
          score = match ? 100 : 0;
          passed = match;
        }
        break;
      }

      default:
        score = 50;
        passed = true;
    }

    // Apply preferred multiplier
    if (group.level === "preferred" && group.weightMultiplier) {
      score = Math.round(score * group.weightMultiplier);
    }

    groupScores.push({
      groupId: group.id,
      groupName: group.name,
      passed,
      score,
      max,
      matched,
      required,
    });

    totalScore += score;
    totalMax += max;
  }

  return {
    score: totalScore,
    max: totalMax,
    groups: groupScores,
    reasons,
  };
}

// ─── Main Scoring Engine ────────────────────────────────────────────

export function scoreApplicationV2(
  model: CampaignScoringModel,
  candidate: CandidateScoringInput,
): ScoringResult {
  const weights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...(model.weights || {}),
  };

  // 0. Normalize candidate input using ISCO/O*NET/ESCO taxonomy
  // This classifies raw answers into structured data the scoring engine understands
  const normalizedOccupation = candidate.experienceEntries?.[0]?.title
    ? normalizeOccupation(candidate.experienceEntries[0].title, model.targetOccupation)
    : null;
  const normalizedSkills = (candidate.skills || []).map(normalizeSkill);

  // 1. Evaluate eligibility (required groups only)
  const eligibility = evaluateEligibility(model.requirementGroups, candidate);

  // 2. Group requirement groups by dimension
  const dimensionGroups: Record<string, RequirementGroup[]> = {
    education: [],
    experience: [],
    skills: [],
    certifications: [],
    industry: [],
    location: [],
  };

  for (const group of model.requirementGroups) {
    switch (group.type) {
      case "education_level":
      case "education_field":
        dimensionGroups.education.push(group);
        break;
      case "experience_area":
      case "experience_years":
        dimensionGroups.experience.push(group);
        break;
      case "skill_critical":
      case "skill_required":
      case "skill_preferred":
        dimensionGroups.skills.push(group);
        break;
      case "certification":
        dimensionGroups.certifications.push(group);
        break;
      case "industry":
        dimensionGroups.industry.push(group);
        break;
      case "location":
        dimensionGroups.location.push(group);
        break;
    }
  }

  // 3. Score each dimension
  const allReasons: string[] = [];
  const breakdown: ScoreBreakdown[] = [];

  for (const [dimension, groups] of Object.entries(dimensionGroups)) {
    if (groups.length === 0) continue;

    const dimensionWeight = weights[dimension as keyof ScoringWeights] || 0;
    const { score, max, groups: groupScores, reasons } = evaluateDimensionScore(
      groups,
      candidate,
      dimension,
    );

    // Normalize to dimension weight
    const ratio = max > 0 ? score / max : 0;
    const weightedScore = Math.round(ratio * dimensionWeight);

    breakdown.push({
      dimension,
      label: dimension.charAt(0).toUpperCase() + dimension.slice(1),
      score: weightedScore,
      max: dimensionWeight,
      groups: groupScores,
    });

    allReasons.push(...reasons);
  }

  // 4. Calculate total
  const total = breakdown.reduce((sum, d) => sum + d.score, 0);

  // 5. Recommendation
  let recommendation: string;
  if (!eligibility.eligible) {
    recommendation = "Ineligible";
  } else if (total >= 90) {
    recommendation = "Excellent Match";
  } else if (total >= 80) {
    recommendation = "Strong Match";
  } else if (total >= 70) {
    recommendation = "Good Match";
  } else if (total >= 60) {
    recommendation = "Moderate Match";
  } else {
    recommendation = "Weak Match";
  }

  return {
    total,
    breakdown,
    eligibility,
    recommendation,
    reasons: allReasons,
    scoreVersion: 2,
  };
}

// ─── Test Scoring Helper ────────────────────────────────────────────

/**
 * Test the scoring model with hypothetical candidates.
 * Used by the recruiter to validate their scoring rules before publishing.
 */
export function testScoringModel(
  model: CampaignScoringModel,
  testCandidates: CandidateScoringInput[],
): ScoringResult[] {
  return testCandidates.map((candidate) => scoreApplicationV2(model, candidate));
}
