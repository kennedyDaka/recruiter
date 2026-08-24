import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveCampaignDraft, publishCampaign } from "@/lib/campaign-builder.functions";
import {
  addJobTitleToMaster,
  occupationDetail,
  onetDuties,
  searchTaxonomy,
} from "@/lib/taxonomy.functions";
import type { EscoOccupationDetail } from "@/lib/taxonomy/esco";
import type { TaxonomyEntry } from "@/lib/taxonomy/types";
import {
  APPLICATION_SECTIONS,
  ARRANGEMENTS,
  ACTION_VERBS,
  COUNTRIES,
  CURRENCIES,
  DAILY_RATE_MWK,
  DEFAULT_WEIGHTS,
  weightsForIscoFamily,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  FIELDS_OF_STUDY,
  HIRING_REASONS,
  LANGUAGES,
  LANGUAGE_LEVELS,
  PROFICIENCIES,
  QUALIFICATIONS,
  SALARY_TYPES,
  SCORE_CATEGORY_LABELS,
  SHIFT_TYPES,
  TRAVEL_FREQUENCIES,
  WEEKDAYS,
  WORK_LOCATIONS,
  billableDays,
  checkCampaignQuality,
  departmentPlaceholderFor,
  defaultBuilder,
  generateJobDescription,
  generateQuestions,
  looksLikeDuty,
  responsibilityObjectsFor,
  responsibilitySentence,
  type JobBuilder,
  type ScoreCategory,
} from "@/lib/job-builder";
import {
  FALLBACK_CERTIFICATIONS,
  FALLBACK_FAMILIES,
  FALLBACK_INDUSTRIES,
  FALLBACK_LICENSES,
  FALLBACK_SKILLS,
} from "@/lib/recruitment-catalog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STEPS = [
  "Role",
  "Location",
  "Requirements",
  "Responsibilities",
  "Conditions",
  "Questions",
  "Scoring",
  "Publish",
];


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Chips({ values, onRemove }: { values: string[]; onRemove: (value: string) => void }) {
  if (!values.length) return <p className="text-sm text-muted-foreground">Nothing selected yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Badge key={value} variant="secondary" className="gap-1">
          {value}
          <button
            type="button"
            className="ml-1 opacity-60 hover:opacity-100"
            onClick={() => onRemove(value)}
          >
            ×
          </button>
        </Badge>
      ))}
    </div>
  );
}

function TaxonomySearch({
  value,
  source,
  kind = "occupation",
  placeholder,
  clearLabel = "Clear selection",
  onPick,
  onClear,
  onAddNew,
}: {
  value: string;
  source: string | null;
  kind?: "occupation" | "skill" | "job_family";
  placeholder?: string;
  clearLabel?: string;
  onPick: (label: string, externalId: string | null, source: "local" | "esco" | "custom") => void;
  onClear: () => void;
  /** When set, a "no exact match → add" affordance appears (job titles only). */
  onAddNew?: (label: string) => void;
}) {
  const search = useServerFn(searchTaxonomy);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TaxonomyEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setFailed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    timeoutRef.current = setTimeout(async () => {
      try {
        const result = (await search({
          data: { kind, query: trimmed, limit: 8 },
        })) as { data: TaxonomyEntry[] };
        setResults(result.data ?? []);
        setFailed(false);
        setOpen(true);
      } catch {
        // The external catalog (ESCO) can hiccup or time out — tell the
        // recruiter the search failed instead of showing a bare "no matches".
        setResults([]);
        setFailed(true);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          value={focused || query ? query : value}
          placeholder={placeholder ?? "Type to search (ESCO + local catalog)"}
          maxLength={120}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) setOpen(false);
          }}
          onFocus={() => {
            setFocused(true);
            if (query.trim().length >= 2) setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setOpen(false), 150);
          }}
        />
        {source ? (
          <Badge variant="outline" className="shrink-0 self-center">
            {source === "esco" ? "ESCO" : source === "local" ? "Catalog" : "Typed"}
          </Badge>
        ) : null}
      </div>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : results.length ? (
            <>
              <ul className="max-h-64 overflow-auto py-1">
                {results.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(
                          entry.label,
                          entry.externalId ?? entry.id,
                          entry.source === "esco"
                            ? "esco"
                            : entry.source === "manual"
                              ? "custom"
                              : "local",
                        );
                        setOpen(false);
                        setQuery("");
                        setFailed(false);
                      }}
                    >
                      <span>{entry.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entry.source === "esco"
                          ? "ESCO"
                          : entry.source === "manual"
                            ? "Added"
                            : "Local"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* The external catalog always returns fuzzy suggestions, so the
                  "no exact match" case is the norm for an unusual title. The
                  add-new option must stay reachable even when suggestions
                  exist — only hide it when the typed title is already listed. */}
              {onAddNew &&
              query.trim().length >= 2 &&
              !results.some(
                (entry) =>
                  entry.label.trim().toLowerCase() === query.trim().toLowerCase(),
              ) ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const label = query.trim();
                      setOpen(false);
                      setQuery("");
                      onAddNew(label);
                    }}
                  >
                    <Plus className="size-4" />
                    Add "{query.trim()}" as a new job title
                  </button>
                </div>
              ) : null}
            </>
          ) : failed ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Could not reach the catalog — check your connection and try again.
            </p>
          ) : (
            <>
              <p className="px-3 py-2 text-sm text-muted-foreground">No exact match found.</p>
              {onAddNew && query.trim().length >= 2 ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const label = query.trim();
                      setOpen(false);
                      setQuery("");
                      onAddNew(label);
                    }}
                  >
                    <Plus className="size-4" />
                    Add "{query.trim()}" as a new job title
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {value && !query ? (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            onClear();
          }}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

function Picker({
  options,
  onPick,
  placeholder,
}: {
  options: string[];
  onPick: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Select value="" onValueChange={(value) => value && onPick(value)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [builder, setBuilder] = useState<JobBuilder>(() => defaultBuilder());
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [published, setPublished] = useState<{ amount: number; days: number; url: string } | null>(
    null,
  );

  const save = useServerFn(saveCampaignDraft);
  const publish = useServerFn(publishCampaign);
  const addJobTitle = useServerFn(addJobTitleToMaster);

  const patch = (values: Partial<JobBuilder> | ((prev: JobBuilder) => Partial<JobBuilder>)) =>
    setBuilder((prev) =>
      typeof values === "function" ? { ...prev, ...values(prev) } : { ...prev, ...values },
    );
  const [importingDuties, setImportingDuties] = useState(false);
  const [importingOnet, setImportingOnet] = useState(false);
  const [onetConfigured, setOnetConfigured] = useState<boolean | null>(null);

  // Check O*NET configuration on mount
  useEffect(() => {
    onetDuties({ data: { title: "test", limit: 1 } })
      .then((r: any) => setOnetConfigured(r?.data?.configured ?? false))
      .catch(() => setOnetConfigured(false));
  }, []);

  const industries = useQuery({
    queryKey: ["industries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("industries")
        .select("id, name, slug")
        .order("name");
      if (error || !data?.length) return FALLBACK_INDUSTRIES;
      return data as { id: string; name: string; slug: string }[];
    },
  });

  const industrySlug = industries.data?.find((i) => i.id === builder.industryId)?.slug ?? null;

  const skillLibrary = useQuery({
    queryKey: ["skills", industrySlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_library")
        .select("name, category, industry_slug")
        .order("name")
        .limit(1000);
      if (error || !data?.length) return FALLBACK_SKILLS;
      return (data ?? []) as { name: string; category: string; industry_slug: string | null }[];
    },
  });

  const certLibrary = useQuery({
    queryKey: ["certs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_library")
        .select("name")
        .order("name")
        .limit(500);
      if (error || !data?.length) return FALLBACK_CERTIFICATIONS;
      return (data ?? []).map((row: any) => row.name as string);
    },
  });

  const licenseLibrary = useQuery({
    queryKey: ["licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_library")
        .select("name, classes")
        .order("name");
      if (error || !data?.length) return FALLBACK_LICENSES;
      return (data ?? []) as { name: string; classes: string[] }[];
    },
  });

  // Fields of study — one shared catalog (DB, constant as fallback).
  const fieldsOfStudyCatalog = useQuery({
    queryKey: ["fields-of-study"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fields_of_study").select("name").order("name");
      if (error || !data?.length) return FIELDS_OF_STUDY;
      return [...new Set(((data ?? []) as { name: string }[]).map((row) => row.name))];
    },
  });

  // Experience areas — the same job-family catalog the role step uses.
  const allFamilies = useQuery({
    queryKey: ["families-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_families").select("name").order("name");
      if (error || !data?.length) return [...new Set(FALLBACK_FAMILIES.map((f) => f.name))];
      return [...new Set(((data ?? []) as { name: string }[]).map((row) => row.name))];
    },
  });

  const relevantSkills = useMemo(() => {
    const rows = skillLibrary.data ?? [];
    const scoped = industrySlug
      ? rows.filter((r) => !r.industry_slug || r.industry_slug === industrySlug)
      : rows;
    return scoped.filter((r) => !builder.skills.some((s) => s.name === r.name));
  }, [skillLibrary.data, industrySlug, builder.skills]);

  const description = useMemo(() => generateJobDescription(builder), [builder]);
  const issues = useMemo(() => checkCampaignQuality(builder), [builder]);
  const days = billableDays(builder.openingDate, builder.closingDate);
  const weightTotal = Object.values(builder.weights).reduce((sum, value) => sum + value, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const result = await save({
        data: {
          campaignId,
          builder: builder as unknown as Record<string, unknown>,
          name: `${builder.jobTitle} — ${builder.city || builder.country}`,
          jobTitle: builder.jobTitle,
          jobDescription: description,
          hiringReason: builder.hiringReason,
          positions: builder.positions,
          location: [builder.city, builder.region, builder.country].filter(Boolean).join(", "),
          employmentType: builder.employmentType,
          minQualification: builder.minQualification,
          minExperienceYears: builder.minExperience,
          requiredSkills: builder.skills.filter((s) => s.level === "required").map((s) => s.name),
          requiredCertifications: builder.certifications
            .filter((c) => c.level === "required")
            .map((c) => c.name),
          responsibilities: builder.responsibilities.map(responsibilitySentence).filter(Boolean),
          requiredDocuments: builder.sections.documents
            ? ["CV", "Cover letter", "Certificates"]
            : [],
          salaryMin: builder.salaryMin,
          salaryMax: builder.salaryMax,
          salaryCurrency: builder.salaryCurrency,
          startDate: builder.openingDate,
          closingDate: builder.closingDate,
          weights: builder.weights as unknown as Record<string, number>,
          questions: builder.questions.map((q) => ({
            key: q.key,
            category: q.category,
            text: q.text,
            type: q.type,
            options: q.options.map((o) => ({
              label: o.label,
              value: o.value,
              points: o.points,
              disqualifying: Boolean(o.disqualifying),
            })),
            mandatory: q.mandatory,
            condition: q.condition ?? null,
          })),
        },
      } as never);
      return (result as { campaignId: string }).campaignId;
    },
    onSuccess: (id) => {
      setCampaignId(id);
      toast.success("Draft saved");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save draft"),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const id = campaignId ?? (await saveMutation.mutateAsync());
      const result = (await publish({ data: { campaignId: id } } as never)) as {
        campaignId: string;
        days: number;
        paymentPath: string;
      };
      return result;
    },
    onSuccess: (result) => {
      // Redirect to the day-based payment page
      window.location.href = `${window.location.origin}${result.paymentPath}`;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not publish"),
  });

  if (published) {
    return (
      <div className="max-w-2xl rounded-xl border border-border bg-card p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold">Campaign published</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Invoice settled: MWK {published.amount.toLocaleString()} for {published.days} day(s) at
          MWK {DAILY_RATE_MWK.toLocaleString()} per day.
        </p>
        <div className="mt-6 space-y-2">
          <Label>Public application link</Label>
          <div className="flex gap-2">
            <Input readOnly value={published.url} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(published.url);
                toast.success("Link copied");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => navigate({ to: "/campaigns" })}>Go to campaigns</Button>
          {campaignId ? (
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/campaigns/$campaignId", params: { campaignId } })}
            >
              Open campaign
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const regions = COUNTRIES[builder.country] ?? {};
  const cities = regions[builder.region] ?? [];

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                index === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reason for hiring">
              <Select
                value={builder.hiringReason}
                onValueChange={(value) => patch({ hiringReason: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HIRING_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Number of positions">
              <Input
                type="number"
                min={1}
                value={builder.positions}
                onChange={(e) => patch({ positions: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Industry">
              <Select
                value={builder.industryId ?? ""}
                onValueChange={(value) => {
                  const industry = industries.data?.find((i) => i.id === value);
                  patch({
                    industryId: value,
                    industryName: industry?.name ?? "",
                    jobFamilyId: null,
                    jobFamilyName: "",
                    jobTitleId: null,
                    jobTitle: "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(industries.data ?? []).map((industry) => (
                    <SelectItem key={industry.id} value={industry.id}>
                      {industry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Job family">
              <TaxonomySearch
                kind="job_family"
                value={builder.jobFamilyName}
                source={builder.jobFamilySource}
                clearLabel="Clear job family"
                placeholder="Search ESCO job families (ISCO groups)"
                onPick={(label, externalId) =>
                  patch({
                    jobFamilyId: externalId,
                    jobFamilyName: label,
                    jobFamilySource: "esco",
                  })
                }
                onClear={() =>
                  patch({ jobFamilyId: null, jobFamilyName: "", jobFamilySource: null })
                }
              />
            </Field>
            <Field label="Job title">
              <TaxonomySearch
                value={builder.jobTitle}
                source={builder.jobTitleSource}
                placeholder="Search ESCO occupations"
                onPick={async (label, externalId) => {
                  patch({ jobTitle: label, jobTitleId: externalId, jobTitleSource: "esco", jobTitleExternalId: externalId });
                  if (!externalId) return;
                  // Pull the occupation's duties (essential skills), family and
                  // hierarchy from ESCO so scoring has real evidence to grade.
                  const result = (await occupationDetail({
                    data: { uri: externalId },
                  })) as { data: EscoOccupationDetail | null };
                  const detail = result.data;
                  if (!detail) return;
                  patch((prev) => {
                    const next: Partial<JobBuilder> = {};
                    if (detail.family && !prev.jobFamilyName) {
                      next.jobFamilyName = detail.family.label;
                      next.jobFamilyId = detail.family.id;
                      next.jobFamilySource = "esco";
                    }
                    // Pre-fill the scoring weights from the ISCO major group
                    // (family + ancestor chain) unless the recruiter already
                    // rebalanced them.
                    const untouchedWeights = Object.values(prev.weights).every(
                      (value, index) =>
                        value === Object.values(DEFAULT_WEIGHTS)[index],
                    );
                    if (untouchedWeights) {
                      next.weights = weightsForIscoFamily([
                        detail.family?.label,
                        ...detail.ancestors.map((a) => a.label),
                      ]);
                    }
                    // Experience areas: the occupation's own ISCO family plus
                    // ONE level up. The full ancestor chain (… up to the major
                    // group, e.g. "Professionals") is far too broad — it would
                    // count almost any professional work as relevant. The ESCO
                    // API repeats the family as its own first ancestor, so
                    // dedupe before trimming to the two narrowest levels.
                    const areaNames = [
                      detail.family?.label,
                      ...detail.ancestors.map((a) => a.label),
                    ]
                      .filter((name): name is string => Boolean(name))
                      .filter((name, index, all) => all.indexOf(name) === index)
                      .slice(0, 2);
                    const mergedAreas = [...new Set([...prev.experienceAreas, ...areaNames])];
                    if (mergedAreas.length !== prev.experienceAreas.length) {
                      next.experienceAreas = mergedAreas;
                    }
                    const existing = new Set(prev.skills.map((s) => s.name.toLowerCase()));
                    // Only real skill-type entries ("tax legislation",
                    // "bookkeeping") become required skills — duty phrases
                    // ("attach accounting certificates to accounting
                    // transactions") stay in Key Responsibilities instead.
                    const dutySkills = detail.essentialSkills
                      .filter((skill) => !looksLikeDuty(skill))
                      .filter((skill) => !existing.has(skill.toLowerCase()))
                      .slice(0, 8)
                      .map((skill) => ({ name: skill, category: "esco-duty", level: "required" as const }));
                    if (dutySkills.length) {
                      next.skills = [...prev.skills, ...dutySkills];
                    }
                    // The same duties also become Key Responsibilities, so the
                    // vacancy description carries the real work of the role.
                    const existingDuties = new Set(
                      prev.responsibilities
                        .map((r) => r.duty?.toLowerCase())
                        .filter((d): d is string => Boolean(d)),
                    );
                    const dutyItems = detail.essentialSkills
                      .filter((skill) => !existingDuties.has(skill.toLowerCase()))
                      .slice(0, 8)
                      .map((skill) => ({ action: "", object: "", duty: skill }));
                    if (dutyItems.length) {
                      next.responsibilities = [...prev.responsibilities, ...dutyItems];
                    }
                    return next;
                  });
                  // O*NET tasks enrich the same Key Responsibilities list, so
                  // the vacancy carries real task statements without the
                  // recruiter pressing "Import from O*NET" — that button stays
                  // as a manual re-import for adding more.
                  try {
                    const onet = (await onetDuties({
                      data: { title: label, limit: 10 },
                    })) as { data: { configured: boolean; duties: { label: string }[] } };
                    const { configured, duties } = onet.data;
                    if (!configured || !duties.length) return;
                    patch((prev) => {
                      const existingDuties = new Set(
                        prev.responsibilities
                          .map((r) => r.duty?.toLowerCase())
                          .filter((d): d is string => Boolean(d)),
                      );
                      const items = duties
                        .filter((d) => !existingDuties.has(d.label.toLowerCase()))
                        .map((d) => ({ action: "", object: "", duty: d.label }));
                      if (!items.length) return {};
                      return { responsibilities: [...prev.responsibilities, ...items] };
                    });
                  } catch {
                    // O*NET is a best-effort enrichment — ESCO duties are
                    // already applied, so a hiccup here is not fatal.
                  }
                }}
                onClear={() =>
                  patch({ jobTitle: "", jobTitleId: null, jobTitleSource: null, jobTitleExternalId: null })
                }
                onAddNew={async (label) => {
                  // Missing Data: the title isn't in ESCO/O*NET/local — add it
                  // to the platform-wide master so scoring keeps working and
                  // every tenant finds it next time.
                  let id: string | null = null;
                  try {
                    const result = (await addJobTitle({ data: { name: label } })) as {
                      data: { id: string; created: boolean };
                    };
                    id = result.data.id;
                    toast.success(
                      result.data.created
                        ? `Added "${label}" to the job title library`
                        : `"${label}" is already in the job title library`,
                    );
                  } catch {
                    toast.error("Could not save the job title — continuing with the typed title.");
                  }
                  patch({
                    jobTitle: label,
                    jobTitleId: id,
                    jobTitleSource: "custom",
                    jobTitleExternalId: null,
                  });
                }}
              />
            </Field>
            <Field label="Department">
              <Input
                value={builder.department}
                placeholder={departmentPlaceholderFor(builder.jobFamilyName, builder.industryName)}
                maxLength={120}
                onChange={(e) => patch({ department: e.target.value })}
              />
            </Field>
            <Field label="Reports to">
              <Input
                value={builder.reportsTo}
                maxLength={120}
                onChange={(e) => patch({ reportsTo: e.target.value })}
              />
            </Field>
            <Field label="Employment type">
              <Select
                value={builder.employmentType}
                onValueChange={(value) => patch({ employmentType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country">
              <Select
                value={builder.country}
                onValueChange={(value) => {
                  const firstRegion = Object.keys(COUNTRIES[value] ?? {})[0] ?? "";
                  const firstCity = (COUNTRIES[value]?.[firstRegion] ?? [])[0] ?? "";
                  patch({ country: value, region: firstRegion, city: firstCity });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(COUNTRIES).map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Region">
              <Select
                value={builder.region}
                onValueChange={(value) =>
                  patch({ region: value, city: (regions[value] ?? [])[0] ?? "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(regions).map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="City / district">
              <Select value={builder.city} onValueChange={(value) => patch({ city: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Work location type">
              <Select
                value={builder.workLocation}
                onValueChange={(value) => patch({ workLocation: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_LOCATIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Specific site (optional)">
              <Input
                value={builder.specificLocation}
                maxLength={160}
                onChange={(e) => patch({ specificLocation: e.target.value })}
              />
            </Field>
            <Field label="Working arrangement">
              <Select
                value={builder.arrangement}
                onValueChange={(value) => patch({ arrangement: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARRANGEMENTS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2 space-y-2">
              <Label>Working days</Label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((day) => (
                  <label key={day} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={builder.workingDays.includes(day)}
                      onCheckedChange={(checked) =>
                        patch({
                          workingDays: checked
                            ? [...builder.workingDays, day]
                            : builder.workingDays.filter((d) => d !== day),
                        })
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={builder.shiftRequired}
                onCheckedChange={(v) => patch({ shiftRequired: v })}
              />
              <Label>Shift work required</Label>
            </div>
            {builder.shiftRequired ? (
              <Field label="Shift type">
                <Select
                  value={builder.shiftType}
                  onValueChange={(value) => patch({ shiftType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum qualification">
                <Select
                  value={builder.minQualification}
                  onValueChange={(value) => patch({ minQualification: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {QUALIFICATIONS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Qualification is">
                <Select
                  value={builder.qualificationLevel}
                  onValueChange={(value) =>
                    patch({ qualificationLevel: value as JobBuilder["qualificationLevel"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required (disqualifies if lower)</SelectItem>
                    <SelectItem value="preferred">Preferred</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Minimum experience (years)">
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={builder.minExperience}
                  onChange={(e) => patch({ minExperience: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Experience level">
                <Select
                  value={builder.experienceLevel}
                  onValueChange={(value) => patch({ experienceLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="space-y-2">
              <Label>Fields of study</Label>
              <Picker
                placeholder="Add a field of study"
                options={(fieldsOfStudyCatalog.data ?? FIELDS_OF_STUDY).filter(
                  (f: string) => !builder.fieldsOfStudy.includes(f),
                )}
                onPick={(value) => patch({ fieldsOfStudy: [...builder.fieldsOfStudy, value] })}
              />
              <Chips
                values={builder.fieldsOfStudy}
                onRemove={(value) =>
                  patch({ fieldsOfStudy: builder.fieldsOfStudy.filter((f) => f !== value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Experience areas</Label>
              <p className="text-xs text-muted-foreground">
                The selected job family counts automatically; add other fields this role
                overlaps with.
              </p>
              <TaxonomySearch
                kind="job_family"
                value=""
                source={null}
                placeholder="Search ESCO job families for this field of work"
                onPick={(value) =>
                  patch({ experienceAreas: [...builder.experienceAreas, value] })
                }
                onClear={() => undefined}
              />
              {allFamilies.data?.length ? (
                <Picker
                  placeholder="…or add from the local library"
                  options={(allFamilies.data ?? FALLBACK_FAMILIES.map((f) => f.name)).filter(
                    (name: string) =>
                      name !== builder.jobFamilyName && !builder.experienceAreas.includes(name),
                  )}
                  onPick={(value) => patch({ experienceAreas: [...builder.experienceAreas, value] })}
                />
              ) : null}
              <Chips
                values={builder.experienceAreas}
                onRemove={(value) =>
                  patch({ experienceAreas: builder.experienceAreas.filter((a) => a !== value) })
                }
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Skills</Label>
              <TaxonomySearch
                kind="skill"
                value=""
                source={null}
                placeholder="Search ESCO skills, or pick from the local library"
                onPick={(name) => {
                  patch({
                    skills: [
                      ...builder.skills,
                      { name, category: "technical", level: "required" },
                    ],
                  });
                }}
                onClear={() => undefined}
              />
              {relevantSkills.length ? (
                <Picker
                  placeholder="…or add from the local library"
                  options={relevantSkills.slice(0, 300).map((s) => s.name)}
                  onPick={(name) => {
                    const found = relevantSkills.find((s) => s.name === name);
                    patch({
                      skills: [
                        ...builder.skills,
                        { name, category: found?.category ?? "technical", level: "required" },
                      ],
                    });
                  }}
                />
              ) : null}
              <div className="space-y-2">
                {builder.skills.map((skill, index) => (
                  <div
                    key={skill.name}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="flex-1 text-sm">{skill.name}</span>
                    <Select
                      value={skill.level}
                      onValueChange={(value) =>
                        patch({
                          skills: builder.skills.map((s, i) =>
                            i === index ? { ...s, level: value as typeof s.level } : s,
                          ),
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="required">Required</SelectItem>
                        <SelectItem value="preferred">Preferred</SelectItem>
                        <SelectItem value="not_required">Not required</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch({ skills: builder.skills.filter((_, i) => i !== index) })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Software</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Software name, press Enter"
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const value = event.currentTarget.value.trim();
                    if (!value) return;
                    patch({
                      software: [...builder.software, { name: value, proficiency: "Intermediate" }],
                    });
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              {builder.software.map((item, index) => (
                <div
                  key={item.name}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex-1 text-sm">{item.name}</span>
                  <Select
                    value={item.proficiency}
                    onValueChange={(value) =>
                      patch({
                        software: builder.software.map((s, i) =>
                          i === index ? { ...s, proficiency: value as typeof s.proficiency } : s,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFICIENCIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch({ software: builder.software.filter((_, i) => i !== index) })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Label>Certifications</Label>
              <Picker
                placeholder="Add a certification"
                options={(certLibrary.data ?? []).filter(
                  (name: string) => !builder.certifications.some((c) => c.name === name),
                )}
                onPick={(name) =>
                  patch({
                    certifications: [...builder.certifications, { name, level: "required" }],
                  })
                }
              />
              {builder.certifications.map((cert, index) => (
                <div
                  key={cert.name}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex-1 text-sm">{cert.name}</span>
                  <Select
                    value={cert.level}
                    onValueChange={(value) =>
                      patch({
                        certifications: builder.certifications.map((c, i) =>
                          i === index ? { ...c, level: value as typeof c.level } : c,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="preferred">Preferred</SelectItem>
                      <SelectItem value="not_required">Not required</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch({
                        certifications: builder.certifications.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={builder.licenseRequired}
                  onCheckedChange={(v) => patch({ licenseRequired: v })}
                />
                <Label>License required</Label>
              </div>
              {builder.licenseRequired ? (
                <>
                  <Field label="License type">
                    <Select
                      value={builder.licenseType}
                      onValueChange={(value) => patch({ licenseType: value, licenseClass: "" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {(licenseLibrary.data ?? []).map((l) => (
                          <SelectItem key={l.name} value={l.name}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Class">
                    <Select
                      value={builder.licenseClass}
                      onValueChange={(value) => patch({ licenseClass: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          licenseLibrary.data?.find((l) => l.name === builder.licenseType)
                            ?.classes ?? []
                        ).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : null}
            </div>

            <div className="space-y-3">
              <Label>Languages</Label>
              <Picker
                placeholder="Add a language"
                options={LANGUAGES.filter((l) => !builder.languages.some((x) => x.name === l))}
                onPick={(name) =>
                  patch({ languages: [...builder.languages, { name, level: "Professional" }] })
                }
              />
              {builder.languages.map((language, index) => (
                <div
                  key={language.name}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex-1 text-sm">{language.name}</span>
                  <Select
                    value={language.level}
                    onValueChange={(value) =>
                      patch({
                        languages: builder.languages.map((l, i) =>
                          i === index ? { ...l, level: value as typeof l.level } : l,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch({ languages: builder.languages.filter((_, i) => i !== index) })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Build responsibilities from an action and what it applies to. No free typing needed.
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                <ResponsibilityAdder
                  family={builder.jobFamilyName}
                  onAdd={(item) => patch({ responsibilities: [...builder.responsibilities, item] })}
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <TaxonomySearch
                    kind="skill"
                    value=""
                    source={null}
                    placeholder="Search the duty catalog to add a responsibility…"
                    onPick={(label) => {
                      if (
                        builder.responsibilities.some(
                          (r) => r.duty?.toLowerCase() === label.toLowerCase(),
                        )
                      ) {
                        toast.info("That duty is already on the list.");
                        return;
                      }
                      patch({
                        responsibilities: [
                          ...builder.responsibilities,
                          { action: "", object: "", duty: label },
                        ],
                      });
                    }}
                    onClear={() => {}}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!builder.jobTitleExternalId || importingDuties}
                  onClick={async () => {
                    if (!builder.jobTitleExternalId) return;
                    setImportingDuties(true);
                    try {
                      const result = (await occupationDetail({
                        data: { uri: builder.jobTitleExternalId },
                      })) as { data: EscoOccupationDetail | null };
                      const detail = result.data;
                      if (!detail) {
                        toast.error("Could not load duties for this occupation.");
                        return;
                      }
                      const existing = new Set(
                        builder.responsibilities
                          .map((r) => r.duty?.toLowerCase())
                          .filter((d): d is string => Boolean(d)),
                      );
                      const all = [...detail.essentialSkills, ...detail.optionalSkills]
                        .filter((skill) => !existing.has(skill.toLowerCase()))
                        .slice(0, 30)
                        .map((skill) => ({ action: "", object: "", duty: skill }));
                      if (!all.length) {
                        toast.info("All duties for this occupation are already on the list.");
                        return;
                      }
                      patch({ responsibilities: [...builder.responsibilities, ...all] });
                      toast.success(`Imported ${all.length} duties for ${detail.label}.`);
                    } finally {
                      setImportingDuties(false);
                    }
                  }}
                >
                  {importingDuties ? "Importing…" : "Import all duties"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!builder.jobTitle || importingOnet}
                  onClick={async () => {
                    if (!builder.jobTitle) return;
                    setImportingOnet(true);
                    try {
                      const result = (await onetDuties({
                        data: { title: builder.jobTitle, limit: 15 },
                      })) as { data: { configured: boolean; duties: { label: string }[] } };
                      const { configured, duties } = result.data;
                      if (!configured) {
                        toast.error(
                          "O*NET is not configured — set the ONET_API_KEY environment variable (free registration at services.onetcenter.org).",
                        );
                        return;
                      }
                      if (!duties.length) {
                        toast.info("No O*NET duties found for this occupation.");
                        return;
                      }
                      const existing = new Set(
                        builder.responsibilities
                          .map((r) => r.duty?.toLowerCase())
                          .filter((d): d is string => Boolean(d)),
                      );
                      const items = duties
                        .filter((d) => !existing.has(d.label.toLowerCase()))
                        .map((d) => ({ action: "", object: "", duty: d.label }));
                      if (!items.length) {
                        toast.info("All O*NET duties are already on the list.");
                        return;
                      }
                      patch({ responsibilities: [...builder.responsibilities, ...items] });
                      toast.success(`Imported ${items.length} duties from O*NET.`);
                    } finally {
                      setImportingOnet(false);
                    }
                  }}
                >
                  {importingOnet ? "Importing…" : "Import from O*NET"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The duty search draws on the live ESCO skill catalog (13,000+ skills); importing
                all duties adds every essential and optional duty ESCO lists for the occupation.
                {" "}
                {onetConfigured === false ? (
                  <span className="text-amber-600">O*NET is not configured — set ONET_API_KEY to enable real task statements.</span>
                ) : onetConfigured === true ? (
                  <span className="text-emerald-600">O*NET is active and contributing real task statements.</span>
                ) : null}
              </p>
            </div>

            <ul className="space-y-2">
              {builder.responsibilities.map((item, index) => (
                <li
                  key={`${item.action}-${item.object}-${item.duty ?? ""}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex-1 text-sm">{responsibilitySentence(item)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch({
                        responsibilities: builder.responsibilities.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["travelRequired", "Travel required"],
                ["relocationRequired", "Relocation required"],
                ["weekendWork", "Weekend work"],
                ["nightWork", "Night work"],
                ["physicalWork", "Physically demanding"],
                ["driverRequired", "Must be able to drive"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <Switch
                  checked={builder[key] as boolean}
                  onCheckedChange={(value) => patch({ [key]: value } as Partial<JobBuilder>)}
                />
                <Label>{label}</Label>
              </div>
            ))}
            {builder.travelRequired ? (
              <Field label="Travel frequency">
                <Select
                  value={builder.travelFrequency}
                  onValueChange={(value) => patch({ travelFrequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAVEL_FREQUENCIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="sm:col-span-2">
              <Separator />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={builder.showSalary}
                onCheckedChange={(value) => patch({ showSalary: value })}
              />
              <Label>Show salary on the advert</Label>
            </div>
            {builder.showSalary ? (
              <>
                <Field label="Salary type">
                  <Select
                    value={builder.salaryType}
                    onValueChange={(value) => patch({ salaryType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALARY_TYPES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Currency">
                  <Select
                    value={builder.salaryCurrency}
                    onValueChange={(value) => patch({ salaryCurrency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Salary from">
                  <Input
                    type="number"
                    value={builder.salaryMin ?? ""}
                    onChange={(e) =>
                      patch({ salaryMin: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </Field>
                <Field label="Salary to">
                  <Input
                    type="number"
                    value={builder.salaryMax ?? ""}
                    onChange={(e) =>
                      patch({ salaryMax: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </Field>
              </>
            ) : null}

            <div className="sm:col-span-2">
              <Separator />
            </div>

            <Field label="Opening date">
              <Input
                type="date"
                value={builder.openingDate}
                onChange={(e) => patch({ openingDate: e.target.value })}
              />
            </Field>
            <Field label="Closing date">
              <Input
                type="date"
                value={builder.closingDate}
                onChange={(e) => patch({ closingDate: e.target.value })}
              />
            </Field>
            <Field label="Candidate limit (optional)">
              <Input
                type="number"
                value={builder.candidateLimit ?? ""}
                onChange={(e) =>
                  patch({ candidateLimit: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Field>
            <div className="flex items-center gap-3">
              <Switch
                checked={builder.allowEditAfterSubmit}
                onCheckedChange={(value) => patch({ allowEditAfterSubmit: value })}
              />
              <Label>Allow candidates to edit after submitting</Label>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Questions are generated from your requirements. Mandatory questions disqualify
                candidates who fail them.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => patch({ questions: generateQuestions(builder) })}
              >
                Generate questions
              </Button>
            </div>
            {builder.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions yet — generate them to continue.
              </p>
            ) : null}
            <ul className="space-y-3">
              {builder.questions.map((question, index) => (
                <li key={question.key} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{question.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {question.category} •{" "}
                        {question.options.map((o) => o.label).join(" / ") || question.type}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={question.mandatory}
                          onCheckedChange={(value) =>
                            patch({
                              questions: builder.questions.map((q, i) =>
                                i === index ? { ...q, mandatory: value } : q,
                              ),
                            })
                          }
                        />
                        Mandatory
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patch({ questions: builder.questions.filter((_, i) => i !== index) })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-display text-base font-semibold">Scoring weights</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Weights must total 100%. Currently {weightTotal}%.
              </p>
              <div className="mt-4 space-y-3">
                {(Object.keys(builder.weights) as ScoreCategory[]).map((category) => (
                  <div key={category} className="flex items-center gap-3">
                    <span className="w-56 text-sm">{SCORE_CATEGORY_LABELS[category]}</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="w-24"
                      value={builder.weights[category]}
                      onChange={(e) =>
                        patch({
                          weights: { ...builder.weights, [category]: Number(e.target.value) || 0 },
                        })
                      }
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {builder.jobFamilyName ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      patch({
                        weights: weightsForIscoFamily([
                          builder.jobFamilyName,
                          ...builder.experienceAreas,
                        ]),
                      })
                    }
                  >
                    Use {builder.jobFamilyName} defaults
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ weights: { ...DEFAULT_WEIGHTS } })}
                >
                  Reset to defaults
                </Button>
              </div>
              {builder.jobFamilyName ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Weights pre-filled from the {builder.jobFamilyName} job family — adjust
                  them to fit this specific role.
                </p>
              ) : null}
            </div>

            <Separator />

            <div>
              <h3 className="font-display text-base font-semibold">Experience recency</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                When enabled, experience earned outside the window is blended down so stale
                histories rank lower. Off by default.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={Boolean(builder.experienceRecencyYears)}
                    onCheckedChange={(value) =>
                      patch({ experienceRecencyYears: value ? 5 : null })
                    }
                  />
                  Reward recent experience
                </label>
                {builder.experienceRecencyYears ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span>within the last</span>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      className="w-20"
                      value={builder.experienceRecencyYears}
                      onChange={(e) =>
                        patch({ experienceRecencyYears: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                    <span>years</span>
                  </div>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                When off, an older-but-relevant work history scores the same as a recent one.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-display text-base font-semibold">Application sections</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {APPLICATION_SECTIONS.map((section) => (
                  <label key={section.key} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={builder.sections[section.key]}
                      disabled={section.locked}
                      onCheckedChange={(checked) =>
                        patch({
                          sections: { ...builder.sections, [section.key]: Boolean(checked) },
                        })
                      }
                    />
                    {section.label}
                    {section.locked ? (
                      <span className="text-xs text-muted-foreground">(always on)</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 7 ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-display text-base font-semibold">Quality checks</h3>
              {issues.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-600">Everything looks complete.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                  {issues.map((issue) => (
                    <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="font-display text-base font-semibold">Generated job description</h3>
              <Textarea readOnly rows={16} className="mt-3 font-mono text-xs" value={description} />
            </div>

            <div className="rounded-lg border border-border bg-secondary/40 p-4">
              <h3 className="font-display text-base font-semibold">Campaign preview</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                This campaign will run for <strong>{days}</strong> day(s) once published.
                You will choose the exact duration and pay on the next page.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Pricing: MWK {DAILY_RATE_MWK.toLocaleString()} per day × number of days you select.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !builder.jobTitle}
              >
                {saveMutation.isPending ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || issues.length > 0}
              >
                {publishMutation.isPending ? "Publishing…" : "Pay & publish"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </Button>
        <Button
          type="button"
          disabled={step === STEPS.length - 1}
          onClick={() => {
            if (step === 4 && builder.questions.length === 0)
              patch({ questions: generateQuestions(builder) });
            setStep((s) => Math.min(STEPS.length - 1, s + 1));
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function ResponsibilityAdder({
  family,
  onAdd,
}: {
  family: string;
  onAdd: (item: { action: string; object: string }) => void;
}) {
  const [action, setAction] = useState(ACTION_VERBS[0]!);
  const [object, setObject] = useState("");
  const objects = responsibilityObjectsFor(family);

  return (
    <>
      <Select value={action} onValueChange={setAction}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {ACTION_VERBS.map((verb) => (
            <SelectItem key={verb} value={verb}>
              {verb}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={object} onValueChange={setObject}>
        <SelectTrigger>
          <SelectValue placeholder="What it applies to" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {objects.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="secondary"
        disabled={!object}
        onClick={() => {
          onAdd({ action, object });
          setObject("");
        }}
      >
        Add
      </Button>
    </>
  );
}
