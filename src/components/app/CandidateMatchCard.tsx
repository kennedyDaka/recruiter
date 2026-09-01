/**
 * CandidateMatchCard — professional recruiter-facing match summary.
 *
 * Displays overall score, eligibility, experience match, skills, education
 * and a plain-language recruiter insight. Uses data from the existing ORS
 * scoring engine without modifying any scoring logic.
 */

import { useMemo } from "react";
import { CircleCheck, CircleX, Minus, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DIMENSION_LABELS,
  type EligibilityGate,
  type OrsBreakdown,
} from "@/lib/ors";
import { classifyFieldRelevance } from "@/lib/field-relevance";

// ── Types ────────────────────────────────────────────────────────────

interface EducationRow {
  id: string;
  qualification: string;
  field_of_study?: string | null;
  institution?: string | null;
  end_year?: number | null;
}

interface ExperienceRow {
  id: string;
  employer: string;
  position: string;
  field?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
}

interface SkillRow {
  id: string;
  skill: string;
  category?: string | null;
}

interface CampaignInfo {
  min_qualification?: string | null;
  min_experience_years?: number;
  required_skills?: string; // JSON string array
  required_certifications?: string; // JSON string array
  builder?: unknown; // Campaign builder JSON with fieldsOfStudy, etc.
}

export interface CandidateMatchCardProps {
  /** Overall score 0–100 */
  score: number;
  /** Recommendation label from the scoring engine */
  recommendation?: string | null;
  /** "eligible" | "not_eligible" | null */
  eligibilityStatus?: string | null;
  /** Parsed eligibility gates */
  gates: EligibilityGate[];
  /** Parsed score breakdown */
  breakdown: OrsBreakdown[];
  /** Parsed reasons (✓ / △ strings) */
  reasons: string[];
  /** Candidate's years of experience */
  yearsExperience?: number;
  /** Candidate's highest qualification */
  highestQualification?: string | null;
  /** Education rows */
  education?: EducationRow[];
  /** Experience rows */
  experience?: ExperienceRow[];
  /** Skills rows */
  skills?: SkillRow[];
  /** Campaign requirements */
  campaign?: CampaignInfo | undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseJsonList(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function matchLabel(score: number): string {
  if (score >= 90) return "Excellent Match";
  if (score >= 75) return "Strong Match";
  if (score >= 60) return "Good Match";
  if (score >= 40) return "Partial Match";
  return "Low Match";
}

function matchColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-amber-600";
  return "text-destructive";
}

function progressColor(score: number): string {
  if (score >= 75) return "[&>div]:bg-emerald-500";
  if (score >= 60) return "[&>div]:bg-amber-500";
  if (score >= 40) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-destructive";
}

function monthsBetween(start?: string | null, end?: string | null, isCurrent?: boolean): number {
  if (!start) return 0;
  const s = new Date(start);
  if (isNaN(s.getTime())) return 0;
  const e = isCurrent ? new Date() : end ? new Date(end) : new Date();
  if (isNaN(e.getTime())) return 0;
  return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}

function formatMonths(months: number): string {
  if (months < 1) return "<1m";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

function qualificationRank(q: string): number {
  // Must match the ORS engine's QUALIFICATION_LEVELS ordering.
  const levels = [
    "None",
    "Secondary School",
    "Certificate",
    "Diploma",
    "Bachelor",
    "Postgraduate Diploma",
    "Honours Degree",
    "Master",
    "Doctorate",
    "Professor",
  ];
  const normalised = q?.trim().toLowerCase() ?? "";
  // Exact match first
  const exact = levels.findIndex((l) => l.toLowerCase() === normalised);
  if (exact >= 0) return exact;
  // Fuzzy: check if the input contains a level name (e.g. "Bachelor's Degree" contains "Bachelor")
  const fuzzy = levels.findIndex((l) =>
    normalised.includes(l.toLowerCase()) || l.toLowerCase().includes(normalised),
  );
  return fuzzy >= 0 ? fuzzy : 0;
}

// ── Gate icon helpers ────────────────────────────────────────────────

function GateIcon({ passed }: { passed: boolean }) {
  return passed
    ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
    : <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />;
}

function WarningIcon() {
  return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />;
}

function DashIcon() {
  return <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

// ── Main component ───────────────────────────────────────────────────

export function CandidateMatchCard({
  score,
  recommendation,
  eligibilityStatus,
  gates,
  breakdown,
  reasons,
  yearsExperience = 0,
  highestQualification,
  education = [],
  experience = [],
  skills = [],
  campaign,
}: CandidateMatchCardProps) {
  // ── Eligibility helpers ──
  const requiredSkills = useMemo(() => parseJsonList(campaign?.required_skills), [campaign?.required_skills]);
  const requiredCerts = useMemo(() => parseJsonList(campaign?.required_certifications), [campaign?.required_certifications]);
  const candidateSkillNames = useMemo(() => skills.map((s) => s.skill.toLowerCase()), [skills]);
  const matchedSkills = useMemo(
    () => requiredSkills.filter((rs) => candidateSkillNames.some((cs) => cs.includes(rs.toLowerCase()) || rs.toLowerCase().includes(cs))),
    [requiredSkills, candidateSkillNames],
  );
  const missingSkills = useMemo(
    () => requiredSkills.filter((rs) => !matchedSkills.includes(rs)),
    [requiredSkills, matchedSkills],
  );

  // ── Experience helpers ──
  const totalMonths = useMemo(
    () => experience.reduce((sum, e) => sum + monthsBetween(e.start_date, e.end_date, e.is_current), 0),
    [experience],
  );
  const relevantMonths = useMemo(
    () => experience
      .filter((e) => e.field && e.field.trim().length > 0)
      .reduce((sum, e) => sum + monthsBetween(e.start_date, e.end_date, e.is_current), 0),
    [experience],
  );
  const relevantEntries = useMemo(
    () => experience.filter((e) => e.field && e.field.trim().length > 0),
    [experience],
  );
  const minExpYears = campaign?.min_experience_years ?? 0;
  const expMet = yearsExperience >= minExpYears;

  // ── Education helpers ──
  const highestEdu = education.length > 0
    ? education.reduce((best, e) => qualificationRank(e.qualification) > qualificationRank(best.qualification) ? e : best)
    : null;
  const eduRank = highestEdu ? qualificationRank(highestEdu.qualification) : 0;
  const requiredRank = campaign?.min_qualification ? qualificationRank(campaign.min_qualification) : 0;
  const eduMet = requiredRank === 0 || eduRank >= requiredRank;

  // ── Field relevance for education ──
  // Extract required education fields from multiple sources:
  // 1. builder.fieldsOfStudy (explicit fields)
  // 2. builder.experienceAreas (experience → field mapping)
  // 3. builder.industry / industryName (industry → field mapping)
  // 4. Job title inference (e.g. "Farm Manager" → Agriculture)
  const educationRequiredFields = useMemo(() => {
    if (!campaign?.builder) return [];
    try {
      const parsed = typeof campaign.builder === 'string' ? JSON.parse(campaign.builder) : campaign.builder;
      // 1. Direct fieldsOfStudy
      const fields = parsed?.fieldsOfStudy;
      if (Array.isArray(fields) && fields.length > 0) {
        return fields.map((f: unknown) => typeof f === 'string' ? f : typeof f === 'object' && f !== null && 'name' in f ? (f as { name: string }).name : null).filter((f): f is string => typeof f === 'string');
      }
      // 2. Experience areas → field inference
      const expAreas = parsed?.experienceAreas;
      if (Array.isArray(expAreas) && expAreas.length > 0) {
        return expAreas.map((a: unknown) => typeof a === 'string' ? a : typeof a === 'object' && a !== null && 'name' in a ? (a as { name: string }).name : null).filter((f): f is string => typeof f === 'string');
      }
      // 3. Industry → field inference
      const industry = parsed?.industry || parsed?.industryName;
      if (typeof industry === 'string' && industry.length > 0) {
        return [industry];
      }
      // 4. Job title → field inference (e.g. "Farm Manager" → Agriculture)
      const jobTitle = parsed?.jobTitle || (campaign as any)?.job_title;
      if (typeof jobTitle === 'string') {
        const titleLower = jobTitle.toLowerCase();
        if (titleLower.includes('farm') || titleLower.includes('agricultur') || titleLower.includes('horticultur')) return ['Agriculture'];
        if (titleLower.includes('nurs') || titleLower.includes('health') || titleLower.includes('clinic')) return ['Nursing'];
        if (titleLower.includes('account') || titleLower.includes('financ')) return ['Accounting'];
        if (titleLower.includes('engineer') || titleLower.includes('technic')) return ['Engineering'];
        if (titleLower.includes('teacher') || titleLower.includes('educat')) return ['Education'];
        if (titleLower.includes('bank') || titleLower.includes('teller') || titleLower.includes('insurance')) return ['Finance'];
        if (titleLower.includes('logistic') || titleLower.includes('warehouse') || titleLower.includes('supply')) return ['Logistics'];
      }
    } catch { /* ignore */ }
    return [];
  }, [campaign?.builder, (campaign as any)?.job_title]);
  const candidateFields = useMemo(
    () => education.map((e) => e.field_of_study).filter((f): f is string => Boolean(f)),
    [education],
  );
  const fieldRelevance = useMemo(
    () => candidateFields.length > 0 && educationRequiredFields.length > 0
      ? classifyFieldRelevance(candidateFields[0] ?? "", educationRequiredFields)
      : { relevance: "unknown" as const, score: 0.5, explanation: "No field requirement configured" },
    [candidateFields, educationRequiredFields],
  );

  // ── Recruiter insight ──
  const insight = useMemo(() => {
    const parts: string[] = [];

    if (score >= 75) {
      parts.push(`Strong candidate scoring ${score}% against the role requirements.`);
    } else if (score >= 60) {
      parts.push(`Good candidate scoring ${score}% against the role requirements.`);
    } else if (score >= 40) {
      parts.push(`Partial match at ${score}% — some gaps to consider.`);
    } else {
      parts.push(`Low match at ${score}% — significant gaps against requirements.`);
    }

    // Experience insight
    if (minExpYears > 0) {
      if (expMet) {
        const extras = yearsExperience - minExpYears;
        parts.push(extras > 0
          ? `Experience exceeds minimum by ${extras} year${extras === 1 ? "" : "s"}.`
          : "Meets the minimum experience requirement.");
      } else {
        parts.push(`Short by ${minExpYears - yearsExperience} year${minExpYears - yearsExperience === 1 ? "" : "s"} of the ${minExpYears}-year minimum.`);
      }
    }
    // Experience field relevance
    if (experience.length > 0) {
      const fieldEntries = experience.filter((e) => e.field && e.field.trim());
      const noFieldEntries = experience.filter((e) => !e.field || !e.field.trim());
      if (noFieldEntries.length > 0 && fieldEntries.length === 0) {
        parts.push("Experience records do not specify a field of work — relevance cannot be assessed.");
      } else if (noFieldEntries.length > 0 && fieldEntries.length > 0) {
        parts.push(`${noFieldEntries.length} of ${experience.length} experience records are missing a field of work.`);
      }
    } else if (minExpYears > 0) {
      parts.push("No work experience provided in the application.");
    }

    // Skills insight
    if (requiredSkills.length > 0) {
      const pct = Math.round((matchedSkills.length / requiredSkills.length) * 100);
      if (pct >= 80) {
        parts.push(`Most required skills are demonstrated (${matchedSkills.length}/${requiredSkills.length}).`);
      } else if (pct >= 50) {
        parts.push(`About half of required skills matched (${matchedSkills.length}/${requiredSkills.length}).`);
      } else if (pct > 0) {
        parts.push(`Only ${matchedSkills.length} of ${requiredSkills.length} required skills matched — ${missingSkills.slice(0, 3).join(", ")} gap${missingSkills.length > 1 ? "s" : ""}.`);
      } else {
        parts.push("None of the required skills were matched from the application.");
      }
    }

    // Education insight
    if (requiredRank > 0 && !eduMet) {
      parts.push(`Education level (${highestEdu?.qualification ?? "None"}) is below the minimum (${campaign?.min_qualification}).`);
    }

    return parts.join(" ");
  }, [score, yearsExperience, minExpYears, expMet, matchedSkills, missingSkills, requiredSkills, eduMet, highestEdu, campaign?.min_qualification]);

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Overall Match Score ── */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-border bg-background">
            <span className={`font-display text-2xl font-bold ${matchColor(score)}`}>{score}%</span>
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{recommendation ?? matchLabel(score)}</h3>
            <p className="text-sm text-muted-foreground">
              {eligibilityStatus === "eligible" ? (
                <span className="text-emerald-600 font-medium">✓ Eligible for consideration</span>
              ) : (
                <span className="text-destructive font-medium">✕ Not eligible</span>
              )}
            </p>
          </div>
        </div>
        <Progress value={score} className={`mt-4 h-2.5 ${progressColor(score)}`} />
      </section>

      {/* ── Eligibility ── */}
      {gates.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eligibility</h3>
          <div className="grid gap-2">
            {gates.map((gate) => {
              const isEducationGate = gate.name.toLowerCase().includes("education");
              // Override reason when v2 gate says "No minimum" but campaign has min_qualification
              const overrideReason = isEducationGate && campaign?.min_qualification && gate.reason.includes("No minimum")
                ? (eduMet
                    ? `${highestEdu?.qualification ?? "None"} meets ${campaign.min_qualification} minimum`
                    : `${highestEdu?.qualification ?? "No qualification"} is below ${campaign.min_qualification} minimum`)
                : gate.reason;
              const overridePassed = isEducationGate && campaign?.min_qualification && gate.reason.includes("No minimum")
                ? eduMet
                : gate.passed;
              // Show field relevance sub-line when education level is met but candidate field is unrelated
              const showFieldWarning = isEducationGate && eduMet && educationRequiredFields.length > 0 && fieldRelevance.relevance === "unrelated";
              return (
                <div key={gate.name} className="flex items-start gap-2 text-sm">
                  <GateIcon passed={overridePassed && !showFieldWarning} />
                  <div>
                    <span className="font-medium">{gate.name}</span>
                    <span className="text-muted-foreground"> — {overrideReason}</span>
                    {showFieldWarning && (
                      <p className="mt-0.5 text-xs text-destructive">
                        ✕ Field relevance: {highestEdu?.field_of_study ?? "Candidate field"} is not related to {educationRequiredFields.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Education eligibility from campaign config (when gate is missing) */}
            {campaign?.min_qualification && !gates.some((g) => g.name.toLowerCase().includes("education")) && (
              <div className="flex items-start gap-2 text-sm">
                {eduMet ? (
                  <GateIcon passed />
                ) : (
                  <GateIcon passed={false} />
                )}
                <div>
                  <span className="font-medium">Education</span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {eduMet
                      ? `${highestEdu?.qualification ?? "None"} meets ${campaign.min_qualification} minimum`
                      : `${highestEdu?.qualification ?? "No qualification"} is below ${campaign.min_qualification} minimum`}
                  </span>
                </div>
              </div>
            )}

            {/* Show required skills eligibility if gates don't cover it */}
            {requiredSkills.length > 0 && !gates.some((g) => g.name.toLowerCase().includes("skill")) && (
              <div className="flex items-start gap-2 text-sm">
                {matchedSkills.length >= requiredSkills.length ? (
                  <GateIcon passed />
                ) : matchedSkills.length > 0 ? (
                  <WarningIcon />
                ) : (
                  <GateIcon passed={false} />
                )}
                <div>
                  <span className="font-medium">Required Skills</span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {matchedSkills.length} of {requiredSkills.length} matched
                  </span>
                </div>
              </div>
            )}

            {/* Show preferred skills if configured */}
            {requiredCerts.length > 0 && !gates.some((g) => g.name.toLowerCase().includes("cert")) && (
              <div className="flex items-start gap-2 text-sm">
                <DashIcon />
                <div>
                  <span className="font-medium">Certifications</span>
                  <span className="text-muted-foreground"> — {requiredCerts.length} required</span>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* ── Experience Match (Priority Section) ── */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Experience Match</h3>

        {minExpYears > 0 ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Required</p>
              <p className="font-medium">{minExpYears}+ years relevant experience</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Candidate</p>
              <p className="font-medium">
                {yearsExperience} years
                {totalMonths > 0 ? ` (${formatMonths(totalMonths)} total)` : ""}
              </p>
              {relevantMonths > 0 && relevantMonths !== totalMonths ? (
                <p className="text-xs text-muted-foreground">
                  {formatMonths(relevantMonths)} relevant
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">No minimum experience configured for this role.</p>
        )}

        {minExpYears > 0 && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            {expMet ? (
              <>
                <CircleCheck className="size-4 text-emerald-600" />
                <span className="text-emerald-600 font-medium">Requirement met</span>
              </>
            ) : (
              <>
                <CircleX className="size-4 text-destructive" />
                <span className="text-destructive font-medium">
                  Short by {minExpYears - yearsExperience} year{minExpYears - yearsExperience === 1 ? "" : "s"}
                </span>
              </>
            )}
          </div>
        )}

        {/* All experience entries */}
        {experience.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Work History
            </p>
            <div className="grid gap-1.5">
              {experience.map((entry) => {
                const months = monthsBetween(entry.start_date, entry.end_date, entry.is_current);
                const hasField = Boolean(entry.field && entry.field.trim());
                return (
                  <div key={entry.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {hasField ? (
                        <CircleCheck className="size-3.5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="size-3.5 text-amber-500" />
                      )}
                      <span className="font-medium">{entry.position}</span>
                      <span className="text-muted-foreground">at {entry.employer}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasField ? (
                        <Badge variant="outline" className="text-xs">{entry.field}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">No field</Badge>
                      )}
                      <span className="text-muted-foreground text-xs">{formatMonths(months)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {experience.length === 0 && (
          <p className="text-sm text-muted-foreground">No work experience recorded.</p>
        )}
      </section>

      {/* ── Match Breakdown ── */}
      {breakdown.filter((b) => b.max > 0).length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match Breakdown</h3>
          <div className="grid gap-3">
            {breakdown
              .filter((item) => item.max > 0)
              .map((item) => {
                const pct = Math.round((item.score / item.max) * 100);
                return (
                  <div key={item.dimension}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium">
                        {item.label || DIMENSION_LABELS[item.dimension] || item.dimension}
                      </span>
                      <span className="text-muted-foreground">
                        {item.score}/{item.max} ({pct}%)
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className={`h-2 ${progressColor(pct)}`}
                    />
                  </div>
                );
              })}
          </div>
        </section>
      ) : null}

      {/* ── Skills Match ── */}
      {requiredSkills.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skills Match</h3>
          <p className="mb-3 text-sm font-medium">
            {matchedSkills.length} of {requiredSkills.length} required skills matched
          </p>

          {matchedSkills.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs text-emerald-600 font-semibold">Matched</p>
              <div className="flex flex-wrap gap-1.5">
                {matchedSkills.map((skill) => (
                  <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                    <CircleCheck className="size-3" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingSkills.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-destructive font-semibold">Missing</p>
              <div className="flex flex-wrap gap-1.5">
                {missingSkills.map((skill) => (
                  <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive border border-destructive/20">
                    <CircleX className="size-3" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Additional candidate skills beyond requirements */}
          {skills.filter((s) => !requiredSkills.some((rs) => rs.toLowerCase() === s.skill.toLowerCase())).length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted-foreground font-semibold">Additional skills declared</p>
              <div className="flex flex-wrap gap-1.5">
                {skills
                  .filter((s) => !requiredSkills.some((rs) => rs.toLowerCase() === s.skill.toLowerCase()))
                  .map((s) => (
                    <span key={s.id} className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {s.skill}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Education ── */}
      {education.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Education</h3>
          <div className="grid gap-2">
            {education.map((edu) => (
              <div key={edu.id} className="flex items-start justify-between text-sm">
                <div>
                  <span className="font-medium">{edu.qualification}</span>
                  {edu.field_of_study ? (
                    <span className="text-muted-foreground"> — {edu.field_of_study}</span>
                  ) : null}
                  {edu.institution ? (
                    <p className="text-xs text-muted-foreground">{edu.institution}</p>
                  ) : null}
                </div>
                {edu.end_year ? (
                  <span className="text-xs text-muted-foreground">{edu.end_year}</span>
                ) : null}
              </div>
            ))}
          </div>
          {campaign?.min_qualification && (
            <div className="mt-2 grid gap-1.5 text-xs">
              {/* Level check */}
              <div className="flex items-center gap-2">
                {eduMet ? (
                  <>
                    <CircleCheck className="size-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-medium">Level: {highestEdu?.qualification ?? "None"} meets {campaign.min_qualification} minimum</span>
                  </>
                ) : (
                  <>
                    <CircleX className="size-3.5 text-destructive" />
                    <span className="text-destructive font-medium">
                      Level: {highestEdu?.qualification ?? "None"} is below {campaign.min_qualification} minimum
                    </span>
                  </>
                )}
              </div>
              {/* Field relevance check */}
              {educationRequiredFields.length > 0 && (
                <div className="flex items-center gap-2">
                  {fieldRelevance.relevance === "exact" || fieldRelevance.relevance === "very_related" || fieldRelevance.relevance === "related" ? (
                    <>
                      <CircleCheck className="size-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Field: {fieldRelevance.explanation}</span>
                    </>
                  ) : fieldRelevance.relevance === "weakly_related" ? (
                    <>
                      <WarningIcon />
                      <span className="text-amber-600">Field: {fieldRelevance.explanation}</span>
                    </>
                  ) : (
                    <>
                      <CircleX className="size-3.5 text-destructive" />
                      <span className="text-destructive">Field: {fieldRelevance.explanation}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      ) : null}

      {/* ── Recruiter Insight ── */}
      {insight ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Candidate Insight</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{insight}</p>
        </section>
      ) : null}

      {/* ── Scoring Evidence ── */}
      {reasons.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scoring Evidence</h3>
          <ul className="grid gap-1.5 text-sm">
            {reasons.map((reason, index) => (
              <li key={`${index}-${reason}`} className="flex items-start gap-2">
                <span
                  className={reason.startsWith("\u2713")
                    ? "text-emerald-600"
                    : reason.startsWith("\u25b3")
                      ? "text-amber-600"
                      : "text-muted-foreground"}
                >
                  {reason.startsWith("\u2713")
                    ? "\u2713"
                    : reason.startsWith("\u25b3")
                      ? "\u25b3"
                      : "\u2022"}
                </span>
                <span>{reason.replace(/^[✓△]\s*/, "")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
