/**
 * ORS Scoring Engine v3 — Requirement-based eligibility + ranking.
 *
 * Architecture:
 *   CANDIDATE INPUT → RAW ANSWERS → NORMALIZATION → CLASSIFICATION → SCORING
 *                                                                  ↓
 *                                                          ELIGIBILITY (pass/fail/review)
 *                                                          SCORE (0-100)
 *                                                          CONFIDENCE (high/medium/low)
 *
 * Golden rules:
 *   1. Unknown data triggers investigation, not automatic rejection
 *   2. Missing information → UNKNOWN, never automatically penalized
 *   3. Relevance determines ranking, not just presence
 *   4. Candidate answers are collected independently of scoring rules
 *   5. Never hard-code rules — recruiter defines rules per job
 */

import type {
  RequirementGroup,
  CampaignScoringModel,
  CandidateScoringInput,
  CandidateEducation,
  CandidateExperience,
  CandidateSkill,
  ScoringResult,
  EligibilityResult,
  EligibilityGate,
  ScoreBreakdown,
  GroupScore,
  ScoringWeights,
  MatchLevel,
  MatchOperator,
  Confidence,
  EducationRelevance,
  ExperienceRelevance,
  SkillMatch,
} from "./ors-requirements";
import {
  DEFAULT_SCORING_WEIGHTS,
  ratioToMatchLevel,
  matchLevelScore,
  calculateConfidence,
} from "./ors-requirements";
import {
  normalizeOccupation,
  normalizeField,
  normalizeSkill,
  normalizeIndustry,
} from "./ors-normalization";

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

// ─── Text Normalization ─────────────────────────────────────────────

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

function valueMatchesAny(candidateValue: string, acceptedValues: string[]): { ratio: number; level: MatchLevel } {
  const normalised = normalise(candidateValue);
  let bestRatio = 0;
  for (const accepted of acceptedValues) {
    const overlap = termOverlap(accepted, candidateValue);
    if (overlap >= 0.75) return { ratio: 1, level: "exact" };
    if (overlap >= 0.5) bestRatio = Math.max(bestRatio, 0.7);
    if (overlap >= 0.33) bestRatio = Math.max(bestRatio, 0.4);
  }
  return { ratio: bestRatio, level: ratioToMatchLevel(bestRatio) };
}

// ─── Education Relevance ────────────────────────────────────────────

function classifyEducationRelevance(
  fieldOfStudy: string,
  acceptedFields: string[],
): { relevance: EducationRelevance; score: number; evidence: string[] } {
  if (!fieldOfStudy || !acceptedFields.length) {
    return { relevance: "unknown", score: 0.5, evidence: ["No field data available"] };
  }

  const { ratio, level } = valueMatchesAny(fieldOfStudy, acceptedFields);

  if (ratio >= 0.9) return { relevance: "exact", score: 1.0, evidence: [`Exact match: ${fieldOfStudy}`] };
  if (ratio >= 0.7) return { relevance: "very_related", score: 0.9, evidence: [`Very related: ${fieldOfStudy}`] };
  if (ratio >= 0.5) return { relevance: "related", score: 0.7, evidence: [`Related: ${fieldOfStudy}`] };
  if (ratio >= 0.3) return { relevance: "weakly_related", score: 0.3, evidence: [`Weakly related: ${fieldOfStudy}`] };
  return { relevance: "unrelated", score: 0, evidence: [`Unrelated: ${fieldOfStudy}`] };
}

// ─── Experience Relevance ───────────────────────────────────────────

function classifyExperienceRelevance(
  entry: CandidateExperience,
  targetOccupation: string,
  highlyRelevant: string[],
  related: string[],
): { relevance: ExperienceRelevance; score: number; evidence: string[] } {
  const title = entry.title || "";
  const field = entry.field || "";

  // Check highly relevant positions first
  const highMatch = valueMatchesAny(title, highlyRelevant);
  if (highMatch.ratio >= 0.7) {
    return { relevance: "exact", score: 1.0, evidence: [`Exact role match: ${title}`] };
  }

  // Check related positions
  const relMatch = valueMatchesAny(title, related);
  if (relMatch.ratio >= 0.7) {
    return { relevance: "directly_related", score: 0.9, evidence: [`Directly related role: ${title}`] };
  }

  // Check field of work
  if (field) {
    const fieldMatch = valueMatchesAny(field, [...highlyRelevant, ...related]);
    if (fieldMatch.ratio >= 0.5) {
      return { relevance: "strongly_related", score: 0.75, evidence: [`Strongly related field: ${field}`] };
    }
  }

  // Check similarity to target occupation
  const targetMatch = valueMatchesAny(title, [targetOccupation]);
  if (targetMatch.ratio >= 0.5) {
    return { relevance: "related", score: 0.5, evidence: [`Related to target: ${title}`] };
  }

  // Check for weak connection via field
  if (field) {
    const weakFieldMatch = valueMatchesAny(field, [targetOccupation]);
    if (weakFieldMatch.ratio >= 0.3) {
      return { relevance: "weakly_related", score: 0.25, evidence: [`Weakly related: ${title} in ${field}`] };
    }
  }

  // Unknown — cannot determine
  return { relevance: "unknown", score: 0.5, evidence: [`Unknown relevance: ${title}`] };
}

// ─── Skill Match ────────────────────────────────────────────────────

function classifySkillMatch(
  candidateSkill: string,
  requiredSkill: string,
): { match: SkillMatch; score: number; evidence: string[] } {
  const { ratio } = valueMatchesAny(candidateSkill, [requiredSkill]);

  if (ratio >= 0.9) return { match: "exact", score: 1.0, evidence: [`Exact skill: ${candidateSkill}`] };
  if (ratio >= 0.7) return { match: "equivalent", score: 0.9, evidence: [`Equivalent skill: ${candidateSkill}`] };
  if (ratio >= 0.5) return { match: "related", score: 0.7, evidence: [`Related skill: ${candidateSkill}`] };
  if (ratio >= 0.3) return { match: "partial", score: 0.4, evidence: [`Partial match: ${candidateSkill}`] };
  return { match: "unrelated", score: 0, evidence: [] };
}

// ─── Experience Duration ────────────────────────────────────────────

function calculateRelevantYears(
  entries: CandidateExperience[],
  acceptedValues: string[],
  recencyYears?: number,
): { totalYears: number; recentYears: number; entries: CandidateExperience[] } {
  let totalYears = 0;
  let recentYears = 0;
  const relevant: CandidateExperience[] = [];
  const now = new Date();

  for (const entry of entries) {
    const entryField = entry.field || entry.title;
    let isRelevant = false;

    if (acceptedValues.length === 0) {
      // No specific areas — all experience counts
      isRelevant = true;
    } else {
      for (const accepted of acceptedValues) {
        if (valueMatchesAny(entryField, [accepted]).ratio >= 0.5) {
          isRelevant = true;
          break;
        }
      }
    }

    if (!isRelevant) continue;

    const years = entry.years || estimateYears(entry.startDate, entry.endDate, entry.isCurrent);
    totalYears += years;
    relevant.push(entry);

    // Check recency
    if (recencyYears && entry.endDate) {
      const endDate = new Date(entry.endDate);
      const yearsSinceEnd = (now.getTime() - endDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsSinceEnd <= recencyYears) {
        recentYears += years;
      }
    } else if (recencyYears && entry.isCurrent) {
      recentYears += years; // Current position is always recent
    }
  }

  return { totalYears, recentYears, entries: relevant };
}

function estimateYears(start?: string, end?: string, isCurrent?: boolean): number {
  if (!start) return 0;
  const startDate = new Date(start);
  const endDate = isCurrent ? new Date() : end ? new Date(end) : new Date();
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

// ─── Eligibility Engine ─────────────────────────────────────────────

function evaluateEligibility(
  groups: RequirementGroup[],
  candidate: CandidateScoringInput,
): EligibilityResult {
  const gates: EligibilityGate[] = [];
  const reasons: string[] = [];
  let hasUnknown = false;

  for (const group of groups) {
    if (group.state === "informational") continue; // Informational never blocks

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
          const fields = candidate.fieldsOfStudy || [];
          if (fields.length === 0) {
            // Unknown — triggers review, not automatic fail
            hasUnknown = true;
            passed = group.state !== "required";
            reason = "No field of study information provided";
          } else {
            let bestMatch = 0;
            for (const field of fields) {
              const { ratio } = valueMatchesAny(field, group.acceptedValues);
              bestMatch = Math.max(bestMatch, ratio);
            }
            passed = bestMatch >= 0.5;
            reason = passed
              ? "Field of study matches one of the accepted areas"
              : `Field of study doesn't match any accepted area`;
          }
        }
        break;
      }

      case "experience_area": {
        const minYears = group.minYears || 0;
        const entries = candidate.experienceEntries || [];
        const { totalYears } = calculateRelevantYears(entries, group.acceptedValues);

        if (entries.length === 0) {
          // Unknown — triggers review
          hasUnknown = true;
          passed = group.state !== "required";
          reason = "No experience information provided";
        } else if (group.acceptedValues.length === 0) {
          passed = totalYears >= minYears;
          reason = passed
            ? `${Math.round(totalYears)} years meets the ${minYears} year minimum`
            : `Requires ${minYears} years; candidate has ${Math.round(totalYears)}`;
        } else {
          passed = totalYears >= minYears;
          reason = passed
            ? `${Math.round(totalYears)} years in relevant areas meets the ${minYears} year minimum`
            : `Requires ${minYears} years in relevant areas; candidate has ${Math.round(totalYears)}`;
        }
        break;
      }

      case "skill_critical": {
        const skills = (candidate.skills || []).map(normalise);
        const missing: string[] = [];
        for (const skill of group.acceptedValues) {
          const has = skills.some((s) => valueMatchesAny(s, [skill]).ratio >= 0.5);
          if (!has) missing.push(skill);
        }
        passed = missing.length === 0;
        reason = passed
          ? "All critical skills present"
          : `Missing critical skill: ${missing.join(", ")}`;
        break;
      }

      case "skill_required": {
        const skills = (candidate.skills || []).map(normalise);
        let matched = 0;
        for (const skill of group.acceptedValues) {
          const has = skills.some((s) => valueMatchesAny(s, [skill]).ratio >= 0.5);
          if (has) matched++;
        }
        const minRequired = group.operator === "x_of" ? group.minMatch : group.acceptedValues.length;
        passed = matched >= minRequired;
        reason = passed
          ? `${matched} of ${minRequired} required skills matched`
          : `Only ${matched} of ${minRequired} required skills found`;
        break;
      }

      case "certification": {
        const certs = (candidate.certifications || []).map(normalise);
        const missing: string[] = [];
        for (const cert of group.acceptedValues) {
          const has = certs.some((c) => valueMatchesAny(c, [cert]).ratio >= 0.5);
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
          const { ratio } = valueMatchesAny(country, group.acceptedValues);
          passed = ratio >= 0.5;
          reason = passed
            ? `Located in ${candidate.country}`
            : `Located outside accepted countries`;
        }
        break;
      }

      case "industry": {
        if (!group.acceptedValues.length) {
          passed = true;
          reason = "No industry restriction";
        } else {
          const { ratio } = valueMatchesAny(candidate.industry || "", group.acceptedValues);
          passed = ratio >= 0.5;
          reason = passed
            ? `Industry matches`
            : `Industry doesn't match accepted areas`;
        }
        break;
      }

      default:
        passed = true;
        reason = "No evaluation needed";
    }

    gates.push({ name: group.name, passed, reason, state: group.state });

    if (!passed && group.state === "required") {
      reasons.push(`FAIL: ${group.name} — ${reason}`);
    }
  }

  const allRequiredPassed = gates
    .filter((g) => g.state === "required")
    .every((g) => g.passed);

  const status: "pass" | "fail" | "review" = allRequiredPassed
    ? hasUnknown ? "review" : "pass"
    : "fail";

  return {
    eligible: allRequiredPassed,
    status,
    gates,
    reasons,
  };
}

// ─── Score Evaluation ───────────────────────────────────────────────

function evaluateDimensionScore(
  groups: RequirementGroup[],
  candidate: CandidateScoringInput,
  dimension: string,
  model: CampaignScoringModel,
): { score: number; max: number; groups: GroupScore[]; reasons: string[] } {
  const groupScores: GroupScore[] = [];
  const reasons: string[] = [];
  let totalScore = 0;
  let totalMax = 0;

  for (const group of groups) {
    let score = 0;
    let max = 100;
    let matched = 0;
    let required = group.minMatch || 1;
    let passed = false;
    let matchLevel: MatchLevel = "unknown";
    const evidence: string[] = [];

    switch (group.type) {
      case "education_level": {
        const candidateRank = qualLevel(candidate.highestQualification);
        const requiredRank = group.minLevel ? qualLevel(group.minLevel) : 0;

        if (requiredRank === 0) {
          score = candidateRank > 0 ? 100 : 50;
        } else if (candidateRank >= requiredRank) {
          // Exceeds requirement — cap at 100, small bonus for higher level
          const excess = Math.min(candidateRank - requiredRank, 3);
          score = Math.min(100, 100 + excess * 5);
          matchLevel = "exact";
        } else {
          // Below requirement — penalty proportional to gap
          const gap = requiredRank - candidateRank;
          score = gap === 1 ? 60 : gap === 2 ? 30 : 10;
          matchLevel = gap === 1 ? "weakly_related" : "unrelated";
        }
        passed = score >= 60;
        evidence.push(`${candidate.highestQualification || "None"} → ${Math.round(score)}%`);
        break;
      }

      case "education_field": {
        if (!group.acceptedValues.length) {
          score = 80;
          passed = true;
          matchLevel = "related";
          evidence.push("No field preference → 80%");
        } else {
          const fields = candidate.fieldsOfStudy || [];
          let bestRelevance = { relevance: "unknown" as EducationRelevance, score: 0.5, evidence: ["No field data"] };

          for (const field of fields) {
            const rel = classifyEducationRelevance(field, group.acceptedValues);
            if (rel.score > bestRelevance.score) {
              bestRelevance = rel;
            }
          }

          score = Math.round(bestRelevance.score * 100);
          matchLevel = ratioToMatchLevel(bestRelevance.score);
          passed = score >= 50;
          evidence.push(...bestRelevance.evidence);
        }
        break;
      }

      case "experience_area": {
        const minYears = group.minYears || 0;
        const entries = candidate.experienceEntries || [];
        const recencyYears = model.experienceRecencyYears || undefined;

        if (group.acceptedValues.length === 0) {
          // Generic experience
          const candidateYears = candidate.yearsExperience || 0;
          score = minYears > 0
            ? Math.min(100, (candidateYears / minYears) * 100)
            : Math.min(100, (candidateYears / 3) * 100);
          matched = candidateYears >= minYears ? 1 : 0;
          required = 1;
          matchLevel = candidateYears >= minYears ? "exact" : "weakly_related";
          evidence.push(`${candidateYears} years experience`);
        } else {
          // Score by relevance + years + recency
          const { totalYears, recentYears, entries: relevantEntries } = calculateRelevantYears(
            entries, group.acceptedValues, recencyYears,
          );

          // Years score
          const yearsRatio = minYears > 0
            ? Math.min(1, totalYears / minYears)
            : Math.min(1, totalYears / 3);

          // Relevance score — average relevance of relevant entries
          let relevanceSum = 0;
          for (const entry of relevantEntries) {
            const rel = classifyExperienceRelevance(
              entry, model.targetOccupation || "",
              model.highlyRelevantPositions || [], model.relatedPositions || [],
            );
            relevanceSum += rel.score;
            evidence.push(...rel.evidence);
          }
          const avgRelevance = relevantEntries.length > 0
            ? relevanceSum / relevantEntries.length
            : 0;

          // Recency score
          const recencyRatio = recencyYears
            ? (totalYears > 0 ? recentYears / totalYears : 0)
            : 1; // No recency penalty if not configured

          // Combined score: 50% years + 30% relevance + 20% recency
          score = Math.round((yearsRatio * 50 + avgRelevance * 30 + recencyRatio * 20) * 100) / 100;
          matchLevel = ratioToMatchLevel(avgRelevance);
          matched = totalYears >= minYears ? 1 : 0;
          required = 1;
          evidence.push(`${Math.round(totalYears * 10) / 10} years relevant (${Math.round(recentYears)} recent) → ${Math.round(score)}%`);
        }
        break;
      }

      case "skill_critical": {
        const skills = (candidate.skills || []).map(normalise);
        let matchedCount = 0;
        for (const skill of group.acceptedValues) {
          let bestMatch: SkillMatch = "unrelated";
          let bestScore = 0;
          for (const s of skills) {
            const { match, score: mScore } = classifySkillMatch(s, skill);
            if (mScore > bestScore) {
              bestMatch = match;
              bestScore = mScore;
            }
          }
          if (bestScore >= 0.5) {
            matchedCount++;
            evidence.push(`Critical: ${skill} → ${bestMatch}`);
          }
        }
        matched = matchedCount;
        required = group.acceptedValues.length;
        score = required > 0 ? Math.round((matched / required) * 100) : 100;
        matchLevel = matched >= required ? "exact" : matched > 0 ? "related" : "unrelated";
        passed = matched >= required;
        evidence.push(`Critical skills: ${matched}/${required} → ${score}%`);
        break;
      }

      case "skill_required": {
        const skills = (candidate.skills || []).map(normalise);
        let matchedCount = 0;
        for (const skill of group.acceptedValues) {
          const has = skills.some((s) => valueMatchesAny(s, [skill]).ratio >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.operator === "x_of" ? group.minMatch : group.acceptedValues.length;
        score = required > 0 ? Math.min(100, Math.round((matched / required) * 100)) : 100;
        matchLevel = matched >= required ? "exact" : matched > 0 ? "related" : "unrelated";
        passed = matched >= required;
        evidence.push(`Required skills: ${matched}/${required} → ${score}%`);
        break;
      }

      case "skill_preferred": {
        const skills = (candidate.skills || []).map(normalise);
        let matchedCount = 0;
        for (const skill of group.acceptedValues) {
          const has = skills.some((s) => valueMatchesAny(s, [skill]).ratio >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.acceptedValues.length;
        score = required > 0 ? Math.round((matched / required) * 100) : 0;
        matchLevel = matched > 0 ? "related" : "unknown";
        passed = true; // Preferred skills never block eligibility
        if (score > 0) evidence.push(`Preferred skills: ${matched}/${required} bonus`);
        break;
      }

      case "certification": {
        const certs = (candidate.certifications || []).map(normalise);
        let matchedCount = 0;
        for (const cert of group.acceptedValues) {
          const has = certs.some((c) => valueMatchesAny(c, [cert]).ratio >= 0.5);
          if (has) matchedCount++;
        }
        matched = matchedCount;
        required = group.acceptedValues.length;
        score = required > 0 ? Math.round((matched / required) * 100) : 0;
        matchLevel = matched >= required ? "exact" : matched > 0 ? "related" : "unrelated";
        passed = matched >= required;
        if (score > 0) evidence.push(`Certifications: ${matched}/${required} → ${score}%`);
        break;
      }

      case "industry": {
        if (!group.acceptedValues.length) {
          score = 100;
          passed = true;
          matchLevel = "exact";
        } else {
          const { ratio, level } = valueMatchesAny(candidate.industry || "", group.acceptedValues);
          score = Math.round(ratio * 100);
          matchLevel = level;
          passed = ratio >= 0.5;
          evidence.push(`Industry: ${candidate.industry || "Unknown"} → ${matchLevel}`);
        }
        break;
      }

      case "location": {
        if (!group.acceptedValues.length) {
          score = 100;
          passed = true;
          matchLevel = "exact";
        } else {
          const { ratio } = valueMatchesAny(candidate.country || "", group.acceptedValues);
          score = ratio >= 0.5 ? 100 : 0;
          matchLevel = ratio >= 0.5 ? "exact" : "unrelated";
          passed = ratio >= 0.5;
        }
        break;
      }

      default:
        score = 50;
        passed = true;
        matchLevel = "related";
    }

    // Apply preferred multiplier
    if (group.state === "preferred" && group.weightMultiplier) {
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
      matchLevel,
      evidence,
    });

    // Convert evidence into human-readable reasons for the "Why this score" section.
    const icon = passed ? "\u2713" : "\u25b3";
    for (const e of evidence) {
      // Only push short summary reasons (skip verbose per-skill lines)
      if (e.includes("\u2192") || e.includes("/")) {
        reasons.push(`${icon} ${group.name}: ${e}`);
      }
    }

    // Preferred groups add bonus points only — they NEVER reduce the score.
    // Required groups contribute to both numerator and denominator.
    if (group.state === "preferred") {
      totalScore += score; // Bonus added on top
    } else {
      totalScore += score;
      totalMax += max;
    }
  }

  return { score: totalScore, max: totalMax, groups: groupScores, reasons };
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

  // 1. Normalize candidate input
  const normalizedSkills = (candidate.skills || []).map(normalizeSkill);
  const normalizedIndustry = candidate.industry
    ? normalizeIndustry(candidate.industry)
    : null;

  // 2. Evaluate eligibility
  const eligibility = evaluateEligibility(model.requirementGroups, candidate);

  // 3. Group requirement groups by dimension
  const dimensionGroups: { education: RequirementGroup[]; experience: RequirementGroup[]; skills: RequirementGroup[]; certifications: RequirementGroup[]; industry: RequirementGroup[]; location: RequirementGroup[] } = {
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

  // 4. Score each dimension
  const allReasons: string[] = [];
  const allEvidence: string[] = [];
  const breakdown: ScoreBreakdown[] = [];

  for (const [dimension, groups] of Object.entries(dimensionGroups)) {
    if (groups.length === 0) continue;

    const dimensionWeight = weights[dimension as keyof ScoringWeights] || 0;
    const { score, max, groups: groupScores, reasons } = evaluateDimensionScore(
      groups, candidate, dimension, model,
    );

    // When all groups are preferred (max=0), the score IS the bonus —
    // treat it as a percentage of the dimension weight directly.
    const ratio = max > 0 ? Math.min(1, score / max) : Math.min(1, score / 100);
    const weightedScore = Math.round(ratio * dimensionWeight);

    breakdown.push({
      dimension,
      label: dimension.charAt(0).toUpperCase() + dimension.slice(1),
      score: weightedScore,
      max: dimensionWeight,
      groups: groupScores,
    });

    allReasons.push(...reasons);
    for (const g of groupScores) {
      allEvidence.push(...g.evidence);
    }
  }

  // 5. Calculate total
  const total = breakdown.reduce((sum, d) => sum + d.score, 0);

  // 6. Calculate confidence
  const hasData = Boolean(
    candidate.highestQualification ||
    (candidate.experienceEntries && candidate.experienceEntries.length > 0) ||
    (candidate.skills && candidate.skills.length > 0),
  );
  const evidenceCount = allEvidence.length;
  const hasUnknown = eligibility.status === "review";
  const confidence = hasUnknown
    ? "low"
    : calculateConfidence(hasData, evidenceCount, Boolean(normalizedIndustry));

  // 7. Recommendation
  let recommendation: string;
  if (eligibility.status === "fail") {
    recommendation = "Ineligible — does not meet required criteria";
  } else if (eligibility.status === "review") {
    recommendation = "Requires review — some information could not be verified";
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
    confidence,
    recommendation,
    reasons: allReasons,
    discrepancies: [],
    scoreVersion: 3,
  };
}

// ─── Test Scoring Helper ────────────────────────────────────────────

export function testScoringModel(
  model: CampaignScoringModel,
  testCandidates: CandidateScoringInput[],
): ScoringResult[] {
  return testCandidates.map((candidate) => scoreApplicationV2(model, candidate));
}
