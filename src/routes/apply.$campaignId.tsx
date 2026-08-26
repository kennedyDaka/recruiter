import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Award,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileText,
  GraduationCap,
  MapPin,
  Plus,
  TimerReset,
  Trash2,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { submitApplication } from "@/lib/apply.functions";
import { uploadApplicationDocument } from "@/lib/documents.functions";
import { searchTaxonomy } from "@/lib/taxonomy.functions";
import {
  addUniversityToMaster,
  searchUniversityCatalog,
} from "@/lib/universities.functions";
import type { UniversityEntry } from "@/lib/university-catalog";
import { searchCertificationCatalog, type CertificationEntry } from "@/lib/certifications.functions";
import { APPLICANT_COUNTRIES, CITIES_BY_COUNTRY, DIAL_CODES, FIELDS_OF_STUDY } from "@/lib/applicant-catalog";
import { FALLBACK_FAMILIES, FALLBACK_SKILLS } from "@/lib/recruitment-catalog";
import { QUALIFICATION_LEVELS, yearsFromExperience } from "@/lib/ors";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DescriptionSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
};

type Recruiter = {
  name: string | null;
  logo_url: string | null;
  settings: string | null;
} | null;

type CampaignSummary = {
  id: string;
  name: string | null;
  job_title: string | null;
  location: string | null;
  employment_type: string | null;
  job_description: string | null;
  responsibilities: string[] | null;
  required_skills: string[] | null;
  required_certifications: string[] | null;
  required_documents: string[] | null;
  min_qualification: string | null;
  min_experience_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  start_date: string | null;
  closing_date: string | null;
  referee_count: number | null;
  status: string | null;
  published_at: string | null;
  tenants: Recruiter;
};

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_mandatory: boolean | null;
  category: string | null;
  campaign_answer_options: { label: string; value: string; points: number; sort_order: number }[];
};

type PersonalForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  location: string;
  professional_summary: string;
  linkedin_url: string;
  portfolio_url: string;
};

type EducationEntry = {
  qualification: string;
  field_of_study: string;
  institution: string;
  country: string;
  start_year: string;
  end_year: string;
};

type ExperienceEntry = {
  employer: string;
  position: string;
  field: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  responsibilities: string;
  reason_for_leaving: string;
};

type RefereeEntry = {
  name: string;
  organisation: string;
  position: string;
  relationship: string;
  phone: string;
  email: string;
};

type ApplicationDraft = {
  version: 1;
  saved_at: string;
  wizard_step: number;
  form: PersonalForm;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  skills: string[];
  certifications: string[];
  referees: RefereeEntry[];
  answers: Record<string, string | string[]>;
  documents?: Record<string, { name: string; size: number }>;
};

type ApplicationStep =
  | "contact"        // Contact + Profile + Skills
  | "education"      // Education + Certifications
  | "experience"     // Experience + References
  | "documents"
  | "screening"
  | "review";

const emptyEducation = (country = ""): EducationEntry => ({
  qualification: "Secondary School",
  field_of_study: "",
  institution: "",
  country,
  start_year: "",
  end_year: "",
});

const emptyExperience = (): ExperienceEntry => ({
  employer: "",
  position: "",
  field: "",
  start_date: "",
  end_date: "",
  is_current: false,
  responsibilities: "",
  reason_for_leaving: "",
});

const emptyReferee = (): RefereeEntry => ({
  name: "",
  organisation: "",
  position: "",
  relationship: "",
  phone: "",
  email: "",
});

const APPLICATION_CONSENT_VERSION = "2026-08-14";

const emptyPersonalForm = (): PersonalForm => ({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  country: "",
  city: "",
  location: "",
  professional_summary: "",
  linkedin_url: "",
  portfolio_url: "",
});

function isApplicationDraft(value: unknown): value is ApplicationDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ApplicationDraft>;
  return (
    draft.version === 1 &&
    typeof draft.saved_at === "string" &&
    typeof draft.wizard_step === "number" &&
    Boolean(draft.form) &&
    Array.isArray(draft.education) &&
    Array.isArray(draft.experience) &&
    Array.isArray(draft.skills) &&
    Array.isArray(draft.referees) &&
    Boolean(draft.answers) &&
    typeof draft.answers === "object"
  );
}

/**
 * Searchable institution dropdown backed by the university master library
 * (synced from Hipo). The candidate picks a real institution instead of
 * typing free text, so education data stays structured and scoreable.
 */
function UniversitySearch({
  id,
  value,
  country,
  onPick,
  onClear,
}: {
  id: string;
  value: string;
  country?: string;
  onPick: (name: string) => void;
  onClear: () => void;
}) {
  const universitySearch = useServerFn(searchUniversityCatalog);
  const addUniversity = useServerFn(addUniversityToMaster);
  const [query, setQuery] = useState(value);
  const [hits, setHits] = useState<UniversityEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setFailed(false);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    timeoutRef.current = setTimeout(async () => {
      try {
        const result = (await universitySearch({
          data: { query: trimmed, country: country || null, limit: 10 },
        })) as { data: UniversityEntry[] };
        setHits(result.data ?? []);
        setOpen(true);
      } catch {
        setHits([]);
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
  }, [query, country]);

  return (
    <div className="relative">
      <Input
        id={id}
        value={query || value}
        maxLength={160}
        placeholder="Search for your institution…"
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) setOpen(false);
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            // Canonicalise to the picked institution; keep free typing as a
            // fallback for institutions missing from the library.
            onPick(query.trim());
          }, 150)
        }
      />
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : hits.length ? (
            <>
              <ul className="max-h-56 overflow-auto py-1">
                {hits.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuery(entry.name);
                        setOpen(false);
                        onPick(entry.name);
                      }}
                    >
                      <span className="font-medium">{entry.name}</span>
                      {entry.country ? (
                        <span className="text-xs text-muted-foreground">{entry.country}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {/* A partial-name search can return LIKE matches that aren't
                  the institution the candidate means — keep the add-new
                  option reachable unless the typed name is already listed. */}
              {query.trim().length >= 2 &&
              !hits.some(
                (entry) => entry.name.trim().toLowerCase() === query.trim().toLowerCase(),
              ) ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      const name = query.trim();
                      try {
                        const result = (await addUniversity({
                          data: { name, country: country || null },
                        })) as { data: { entry: { name: string }; created: boolean } };
                        setQuery(result.data.entry.name);
                        setOpen(false);
                        onPick(result.data.entry.name);
                        toast.success(
                          result.data.created
                            ? `Added "${name}" to the institution library`
                            : "Institution already in the library",
                        );
                      } catch {
                        // Library unreachable — still accept the typed name so
                        // the application can continue.
                        setOpen(false);
                        onPick(name);
                      }
                    }}
                  >
                    <Plus className="size-4" />
                    Add "{query.trim()}" as a new institution
                  </button>
                </div>
              ) : null}
            </>
          ) : failed ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Could not reach the university library — you can still type the institution name.
            </p>
          ) : (
            <>
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No institutions found in the library.
              </p>
              {query.trim().length >= 2 ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      const name = query.trim();
                      try {
                        const result = (await addUniversity({
                          data: { name, country: country || null },
                        })) as { data: { entry: { name: string }; created: boolean } };
                        setQuery(result.data.entry.name);
                        setOpen(false);
                        onPick(result.data.entry.name);
                        toast.success(
                          result.data.created
                            ? `Added "${name}" to the institution library`
                            : "Institution already in the library",
                        );
                      } catch {
                        // Library unreachable — still accept the typed name so
                        // the application can continue.
                        setOpen(false);
                        onPick(name);
                      }
                    }}
                  >
                    <Plus className="size-4" />
                    Add "{query.trim()}" as a new institution
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Searchable position dropdown backed by the same ESCO occupation catalog the
 * recruiter's builder uses — one source of truth, so a position the candidate
 * types always matches the vocabulary the scoring engine compares against.
 */
function OccupationSearch({
  id,
  value,
  onPick,
}: {
  id: string;
  value: string;
  onPick: (name: string) => void;
}) {
  const occupationSearch = useServerFn(searchTaxonomy);
  const [query, setQuery] = useState(value);
  const [hits, setHits] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setFailed(false);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    timeoutRef.current = setTimeout(async () => {
      try {
        const result = (await occupationSearch({
          data: { kind: "occupation", query: trimmed, limit: 8 },
        })) as { data: { id: string; label: string }[] };
        setHits(result.data ?? []);
        setOpen(true);
      } catch {
        setHits([]);
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
  }, [query]);

  return (
    <div className="relative">
      <Input
        id={id}
        value={query || value}
        maxLength={160}
        placeholder="Search ESCO occupations…"
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) setOpen(false);
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            onPick(query.trim());
          }, 150)
        }
      />
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : hits.length ? (
            <ul className="max-h-56 overflow-auto py-1">
              {hits.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setQuery(entry.label);
                      setOpen(false);
                      onPick(entry.label);
                    }}
                  >
                    <span>{entry.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">ESCO</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : failed ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Could not reach the occupation catalog — you can still type the position.
            </p>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">No occupations found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/apply/$campaignId")({
  head: () => ({
    meta: [
      { title: "Apply - Operon Recruit" },
      { name: "description", content: "Submit a structured application for this role." },
    ],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const { campaignId } = Route.useParams();
  const submit = useServerFn(submitApplication);
  const uploadDocument = useServerFn(uploadApplicationDocument);
  const taxonomySearch = useServerFn(searchTaxonomy);
  const draftStorageKey = `operon:application-draft:${campaignId}`;
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState<PersonalForm>(emptyPersonalForm);
  const [education, setEducation] = useState<EducationEntry[]>([emptyEducation()]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([emptyExperience()]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [certificationInput, setCertificationInput] = useState("");
  const [certificationHits, setCertificationHits] = useState<CertificationEntry[]>([]);
  const [certificationOpen, setCertificationOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({});
  const [restoredDocuments, setRestoredDocuments] = useState<
    Record<string, { name: string; size: number }>
  >({});
  const [referees, setReferees] = useState<RefereeEntry[]>([emptyReferee(), emptyReferee()]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ApplicationDraft | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["apply-campaign", campaignId],
    queryFn: async () => {
      // The URL parameter is a public_token (e.g. "pub-abc123") or a campaign UUID.
      // Try public_token first, then fall back to id lookup.
      let { data, error } = await supabase
        .from("campaigns")
        .select(
          "id, name, job_title, location, employment_type, job_description, responsibilities, required_skills, required_certifications, required_documents, min_qualification, min_experience_years, salary_min, salary_max, salary_currency, start_date, closing_date, referee_count, builder, status, published_at, tenants(name, logo_url, settings)",
        )
        .eq("public_token", campaignId)
        .maybeSingle();

      if (!data) {
        // Fallback: maybe the URL contains the actual campaign UUID
        const byId = await supabase
          .from("campaigns")
          .select(
            "id, name, job_title, location, employment_type, job_description, responsibilities, required_skills, required_certifications, required_documents, min_qualification, min_experience_years, salary_min, salary_max, salary_currency, start_date, closing_date, referee_count, builder, status, published_at, tenants(name, logo_url, settings)",
          )
          .eq("id", campaignId)
          .maybeSingle();
        data = byId.data;
        error = byId.error;
      }

      if (error) throw error;
      const raw = data as unknown as CampaignSummary | null;
      if (!raw) return null;
      // JSON-list columns are stored as strings; normalize them to arrays.
      return {
        ...raw,
        responsibilities: parseList(raw.responsibilities),
        required_skills: parseList(raw.required_skills),
        required_certifications: parseList(raw.required_certifications),
        required_documents: parseList(raw.required_documents),
      };
    },
  });

  // Use the resolved campaign UUID for questions (not the public_token from the URL)
  const resolvedCampaignId = campaign?.id as string | undefined;

  const { data: questions } = useQuery({
    queryKey: ["apply-questions", resolvedCampaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_questions")
        .select(
          "id, question_text, question_type, options, is_mandatory, category, sort_order, campaign_answer_options(label, value, points, sort_order)",
        )
        .eq("campaign_id", resolvedCampaignId)
        .order("sort_order");
      if (error) throw error;
      return ((data ?? []) as unknown as Question[])
        .map((question) => ({
          ...question,
          options: parseList(question.options),
        }))
        // Years of experience and highest qualification are collected
        // structurally in the wizard, so the old screening questions that
        // re-asked them are hidden (scoring still sees them via the
        // structured data — see submitApplication).
        .filter(
          (question) =>
            !(
              question.category === "qualification" &&
              question.question_text === "What is your highest completed qualification?"
            ) &&
            !(
              question.category === "experience" &&
              question.question_text.startsWith("How many years of experience do you have in ")
            ),
        );
    },
  });

  const { data: librarySkills } = useQuery({
    queryKey: ["apply-skills"],
    enabled: started,
    queryFn: async () => {
      const { data, error } = await supabase.from("skill_library").select("name").order("name");
      if (error || !data?.length) return FALLBACK_SKILLS.map((item: any) => item.name);
      return data.map((item: any) => item.name);
    },
  });

  // Single shared catalogs: fields of study and fields of work (job families).
  const { data: fieldStudyCatalog } = useQuery({
    queryKey: ["apply-fields-of-study"],
    enabled: started,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fields_of_study")
        .select("name")
        .order("name");
      if (error || !data?.length) return FIELDS_OF_STUDY;
      return [...new Set(((data ?? []) as { name: string }[]).map((item) => item.name))];
    },
  });

  const { data: workFieldCatalog } = useQuery({
    queryKey: ["apply-fields-of-work"],
    enabled: started,
    queryFn: async () => {
      const { data, error } = await supabase.from("job_families").select("name").order("name");
      if (error || !data?.length) return [...new Set(FALLBACK_FAMILIES.map((item: any) => item.name as string))];
      return [...new Set(((data ?? []) as { name: string }[]).map((item) => item.name))];
    },
  });

  const fieldStudySuggestions = useMemo(
    () => fieldStudyCatalog ?? FIELDS_OF_STUDY,
    [fieldStudyCatalog],
  );

  // Normalise a typed field of study to the canonical catalog spelling so the
  // value the scorer sees always matches the recruiter's vocabulary (e.g.
  // "computer science" becomes "Computer Science").
  const applyFieldOfStudy = (index: number, raw: string) => {
    const value = raw.trim();
    if (!value) {
      updateEducation(index, { field_of_study: "" });
      return;
    }
    const exact = fieldStudySuggestions.find(
      (field: string) => field.toLowerCase() === value.toLowerCase(),
    );
    updateEducation(index, { field_of_study: exact ?? value });
  };

  // ESCO job families are the shared source for "field of work". The local
  // catalog stays as a broad fallback, and the campaign's own expected fields
  // (ESCO ISCO groups picked by the recruiter) always appear first so the
  // candidate can select exactly what the scoring will match.
  const expectedFields = useMemo(() => {
    const builder = (campaign as unknown as { builder?: unknown } | null)?.builder;
    // SQL NULL builds pass the `typeof x === "object"` check, so null must be
    // excluded explicitly — legacy campaigns can lack a builder entirely.
    if (!builder || (typeof builder !== "string" && typeof builder !== "object")) return [];
    const parsed =
      typeof builder === "string"
        ? (() => {
            try {
              return JSON.parse(builder) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : (builder as Record<string, unknown>);
    const fields: string[] = [];
    // The occupation itself is the most specific expected field of work.
    const jobTitle = parsed["jobTitle"];
    if (typeof jobTitle === "string" && jobTitle.trim()) {
      fields.push(jobTitle.trim());
    }
    const familyName = parsed["jobFamilyName"];
    if (typeof familyName === "string" && familyName.trim()) {
      fields.push(familyName.trim());
    }
    const experienceAreas = parsed["experienceAreas"];
    if (Array.isArray(experienceAreas)) {
      for (const area of experienceAreas) {
        const name = typeof area === "string" ? area : typeof area === "object" && area !== null && "name" in area ? (area as { name: string }).name : null;
        if (name && name.trim()) fields.push(name.trim());
      }
    }
    return [...new Set(fields)];
  }, [campaign]);

  // Expected fields first (occupation, family, areas), then the rest of the
  // catalog — so the field the scorer will match on is the first thing the
  // candidate sees, not buried in an alphabetised list.
  const familySuggestions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const name of [...expectedFields, ...(workFieldCatalog ?? [])]) {
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }
    return ordered;
  }, [expectedFields, workFieldCatalog]);

  const descriptionSections = useMemo(
    () => parseJobDescription(campaign?.job_description),
    [campaign?.job_description],
  );
  const citySuggestions = CITIES_BY_COUNTRY[form.country] ?? [];

  // Google Jobs structured data — emitted only for live campaigns whose
  // tenant left Google distribution enabled (default on).
  const jobPostingLd = useMemo(() => {
    if (!campaign) return null;
    if (campaign.status !== "active") return null;
    const tenantSettings = (() => {
      try {
        const raw = campaign.tenants?.settings;
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { distribution?: { googleJobs?: unknown } };
        return parsed;
      } catch {
        return null;
      }
    })();
    if (tenantSettings?.distribution?.googleJobs === false) return null;
    if (!campaign.job_title) return null;

    const employmentType = mapEmploymentType(campaign.employment_type);
    const baseSalary =
      campaign.salary_min != null || campaign.salary_max != null
        ? {
            "@type": "MonetaryAmount",
            currency: campaign.salary_currency ?? "MWK",
            value: {
              "@type": "QuantitativeValue",
              ...(campaign.salary_min != null ? { minValue: campaign.salary_min } : {}),
              ...(campaign.salary_max != null ? { maxValue: campaign.salary_max } : {}),
            },
          }
        : undefined;

    return {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: campaign.job_title,
      description:
        campaign.job_description ||
        `${campaign.job_title} at ${campaign.tenants?.name ?? "our company"}. Apply online.`,
      datePosted: campaign.published_at ?? new Date().toISOString(),
      ...(campaign.closing_date ? { validThrough: campaign.closing_date } : {}),
      hiringOrganization: {
        "@type": "Organization",
        name: campaign.tenants?.name ?? "Operon Recruit",
        ...(campaign.tenants?.logo_url ? { logo: campaign.tenants.logo_url } : {}),
        sameAs: typeof window !== "undefined" ? window.location.origin : undefined,
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: campaign.location ?? "",
          addressCountry: "MW",
        },
      },
      ...(employmentType ? { employmentType } : {}),
      ...(baseSalary ? { baseSalary } : {}),
      directApply: true,
    };
  }, [campaign]);

  // Live ESCO skill suggestions as the candidate types — one source of truth
  // shared with the recruiter's builder, so selections match the scoring.
  const [escoSkillHits, setEscoSkillHits] = useState<string[]>([]);
  useEffect(() => {
    const trimmed = skillInput.trim();
    if (trimmed.length < 2) {
      setEscoSkillHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = (await taxonomySearch({
          data: { kind: "skill", query: trimmed, limit: 6 },
        })) as { data: { label: string }[] };
        setEscoSkillHits((result.data ?? []).map((entry) => entry.label));
      } catch {
        setEscoSkillHits([]);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillInput]);

  const skillSuggestions = useMemo(
    () =>
      [...new Set([
        ...(campaign?.required_skills ?? []),
        ...(librarySkills ?? []),
        ...escoSkillHits,
      ])].sort((a, b) => a.localeCompare(b)),
    [campaign?.required_skills, librarySkills, escoSkillHits],
  );
  const totalExperience = useMemo(
    () =>
      yearsFromExperience(
        experience.map((entry) => ({
          start_date: entry.start_date || null,
          end_date: entry.end_date || null,
          is_current: entry.is_current,
        })),
      ),
    [experience],
  );

  const applicationSteps = useMemo(
    () =>
      [
        { id: "contact" as const, label: "Contact & Profile" },
        { id: "education" as const, label: "Education & Certs" },
        { id: "experience" as const, label: "Experience & References" },
        ...(campaign?.required_documents?.length
          ? [{ id: "documents" as const, label: "Documents" }]
          : []),
        ...(questions?.length ? [{ id: "screening" as const, label: "Screening" }] : []),
        { id: "review" as const, label: "Review" },
      ] satisfies { id: ApplicationStep; label: string }[],
    [campaign?.required_documents?.length, questions?.length],
  );
  const currentStep = applicationSteps[wizardStep]?.id ?? "review";

  useEffect(() => {
    setDraftLoaded(false);
    setSavedDraft(null);
    setLastSavedAt(null);
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (raw) {
        const draft = JSON.parse(raw) as unknown;
        if (isApplicationDraft(draft)) setSavedDraft(draft);
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setDraftLoaded(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftLoaded || !started || done) return;

    const timeout = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const draft: ApplicationDraft = {
        version: 1,
        saved_at: savedAt,
        wizard_step: wizardStep,
        form,
        education,
        experience,
        skills,
        certifications,
        referees,
        answers,
        documents: Object.fromEntries(
          Object.entries(uploadedFiles).map(([docType, file]) => [
            docType,
            { name: file.name, size: file.size },
          ]),
        ),
      };
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
        setSavedDraft(draft);
        setLastSavedAt(savedAt);
      } catch {
        // A private browser mode or exhausted browser storage must not block an application.
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    answers,
    certifications,
    done,
    draftLoaded,
    draftStorageKey,
    education,
    experience,
    form,
    referees,
    skills,
    started,
    uploadedFiles,
    wizardStep,
  ]);

  const set = (key: keyof PersonalForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const updateEducation = (index: number, patch: Partial<EducationEntry>) =>
    setEducation((entries) =>
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
  const updateExperience = (index: number, patch: Partial<ExperienceEntry>) =>
    setExperience((entries) =>
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
  const updateReferee = (index: number, patch: Partial<RefereeEntry>) =>
    setReferees((entries) =>
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );

  const addSkill = (rawValue = skillInput) => {
    const value = rawValue.trim();
    if (!value) return;
    setSkills((current) =>
      current.some((skill) => skill.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, value],
    );
    setSkillInput("");
  };

  const addCertification = (rawValue = certificationInput) => {
    const value = rawValue.trim();
    if (!value) return;
    setCertifications((current) =>
      current.some((cert) => cert.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, value],
    );
    setCertificationInput("");
    setCertificationOpen(false);
  };

  // Live search of the certification master library as the candidate types —
  // the same catalog recruiters pick from, so selections match the scoring.
  const certificationSearch = useServerFn(searchCertificationCatalog);
  useEffect(() => {
    const trimmed = certificationInput.trim();
    if (trimmed.length < 2) {
      setCertificationHits([]);
      setCertificationOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = (await certificationSearch({
          data: { query: trimmed, limit: 10 },
        })) as { data: CertificationEntry[] };
        setCertificationHits(result.data ?? []);
        setCertificationOpen(true);
      } catch {
        setCertificationHits([]);
        setCertificationOpen(true);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificationInput]);

  const choicesFor = (question: Question) => {
    const stored = [...(question.campaign_answer_options ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    if (stored.length)
      return stored.map((option) => ({ label: option.label, value: option.value }));
    return (question.options ?? []).map((option) => ({ label: option, value: option }));
  };

  const continueApplication = () => {
    if (currentStep === "contact") {
      // Combined: Contact + Profile + Skills
      if (
        !form.first_name.trim() ||
        !form.last_name.trim() ||
        !form.email.trim() ||
        !form.country ||
        !form.city.trim()
      ) {
        toast.error("Complete your name, email, country, and city to continue.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
        toast.error("Enter a valid email address to continue.");
        return;
      }
      if (form.professional_summary.trim().length < 40) {
        toast.error("Add a short professional summary of at least 40 characters.");
        return;
      }
      if (skills.length === 0) {
        toast.error("Add at least one skill to continue.");
        return;
      }
    }

    if (currentStep === "education") {
      // Combined: Education + Certifications
      const incomplete = education.some(
        (entry) =>
          !entry.qualification || !entry.institution.trim() || !entry.field_of_study.trim(),
      );
      if (incomplete) {
        toast.error(
          "Complete the qualification, field of study, and institution for each education record.",
        );
        return;
      }
      const requiredCerts = campaign?.required_certifications ?? [];
      const missingCerts = requiredCerts.filter(
        (cert) => !certifications.some((held) => held.toLowerCase() === cert.toLowerCase()),
      );
      if (missingCerts.length) {
        toast.error(`Add the required certification${missingCerts.length === 1 ? "" : "s"}: ${missingCerts.join(", ")}.`);
        return;
      }
    }

    if (currentStep === "experience") {
      // Combined: Experience + References
      const incomplete = experience.some(
        (entry) =>
          Boolean(entry.employer || entry.position || entry.start_date || entry.end_date) &&
          (!entry.employer.trim() || !entry.position.trim() || !entry.start_date || !entry.field),
      );
      const invalidDate = experience.some(
        (entry) => entry.start_date && entry.end_date && entry.end_date < entry.start_date,
      );
      if (incomplete || invalidDate) {
        toast.error(
          "Each work record needs an employer, position, its field of work, valid dates, and no end date before its start date.",
        );
        return;
      }
      const refRequired = campaign?.referee_count ?? 2;
      const refValid = referees.filter(
        (referee) => referee.name.trim() && (referee.email.trim() || referee.phone.trim()),
      );
      if (refValid.length < refRequired) {
        toast.error(
          `Add ${refRequired} reference${refRequired === 1 ? "" : "s"} with a name and contact detail.`,
        );
        return;
      }
    }

    setWizardStep((value) => Math.min(value + 1, applicationSteps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      // Upload selected documents first so the application references stored files.
      const documents: {
        doc_type: string;
        file_name: string;
        file_path: string;
        file_size: number;
        file_data?: string;
      }[] = [];
      for (const [docType, file] of Object.entries(uploadedFiles)) {
        if (!file) continue;
        const uploaded = await uploadDocument({
          data: {
            campaignId,
            docType,
            fileName: file.name,
            base64: await fileToBase64(file),
          },
        } as never);
        documents.push({
          doc_type: uploaded.doc_type,
          file_name: uploaded.file_name,
          file_path: uploaded.file_path,
          file_size: uploaded.file_size,
          ...(uploaded.file_data ? { file_data: uploaded.file_data } : {}),
        });
      }

      return submit({
        data: {
          campaignId: resolvedCampaignId ?? campaignId,
          consent: { accepted: consentAccepted, version: APPLICATION_CONSENT_VERSION },
          personal: {
            ...form,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            country: form.country.trim(),
            city: form.city.trim(),
            location: form.location.trim(),
            professional_summary: form.professional_summary.trim(),
            linkedin_url: form.linkedin_url.trim(),
            portfolio_url: form.portfolio_url.trim(),
          },
          education: education.map((entry) => ({
            qualification: entry.qualification,
            field_of_study: entry.field_of_study.trim(),
            institution: entry.institution.trim(),
            country: entry.country || form.country,
            start_year: parseYear(entry.start_year),
            end_year: parseYear(entry.end_year),
          })),
          experience: experience
            .filter((entry) => entry.employer.trim())
            .map((entry) => ({
              employer: entry.employer.trim(),
              position: entry.position.trim(),
              field: entry.field.trim(),
              start_date: entry.start_date || null,
              end_date: entry.is_current ? null : entry.end_date || null,
              is_current: entry.is_current,
              responsibilities: entry.responsibilities.trim(),
              reason_for_leaving: entry.reason_for_leaving.trim(),
            })),
          skills: skills.map((skill) => ({ skill, category: "technical" })),
          certifications: certifications.map((name) => ({
            certification: name,
            category: "professional",
          })),
          referees: referees
            .filter((referee) => referee.name.trim())
            .map((referee) => ({
              name: referee.name.trim(),
              organisation: referee.organisation.trim(),
              position: referee.position.trim(),
              relationship: referee.relationship.trim(),
              phone: referee.phone.trim(),
              email: referee.email.trim(),
            })),
          documents,
          answers,
        },
      } as never);
    },
    onSuccess: (result: { reference: string }) => {
      window.localStorage.removeItem(draftStorageKey);
      setSubmitConfirmationOpen(false);
      setDone({ reference: result.reference });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit application"),
  });

  const startApplication = () => {
    window.localStorage.removeItem(draftStorageKey);
    setForm(emptyPersonalForm());
    setEducation([emptyEducation()]);
    setExperience([emptyExperience()]);
    setSkills([]);
    setSkillInput("");
    setCertifications([]);
    setCertificationInput("");
    setUploadedFiles({});
    setRestoredDocuments({});
    setReferees([emptyReferee(), emptyReferee()]);
    setAnswers({});
    setConsentAccepted(false);
    setSavedDraft(null);
    setLastSavedAt(null);
    setWizardStep(0);
    setStarted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resumeApplication = () => {
    if (!savedDraft) return;
    setForm(savedDraft.form);
    setEducation(savedDraft.education);
    setExperience(
      savedDraft.experience.map((entry) => ({ ...emptyExperience(), ...entry })),
    );
    setSkills(savedDraft.skills);
    setCertifications(savedDraft.certifications ?? []);
    setReferees(savedDraft.referees);
    setAnswers(savedDraft.answers);
    setUploadedFiles({});
    setRestoredDocuments(savedDraft.documents ?? {});
    setConsentAccepted(false);
    setLastSavedAt(savedDraft.saved_at);
    setWizardStep(Math.max(0, Math.min(savedDraft.wizard_step, applicationSteps.length - 1)));
    setStarted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const requestSubmission = () => {
    if (!consentAccepted) {
      toast.error("Please provide consent before submitting your application.");
      return;
    }
    setSubmitConfirmationOpen(true);
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      {jobPostingLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingLd) }}
        />
      ) : null}
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <Link to="/jobs" className="text-sm text-muted-foreground hover:text-foreground">
            All roles
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {done ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center shadow-sm">
            <CheckCircle2 className="mx-auto size-10 text-primary" />
            <h1 className="mt-4 font-display text-2xl font-semibold">Application received</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your reference number is{" "}
              <span className="font-medium text-foreground">{done.reference}</span>. We will be in
              touch by email.
            </p>
            <Button asChild className="mt-6">
              <Link to="/jobs">Browse more roles</Link>
            </Button>
          </div>
        ) : !started ? (
          <VacancyOverview
            campaign={campaign ?? null}
            isLoading={isLoading}
            descriptionSections={descriptionSections}
            onApply={startApplication}
            savedDraft={savedDraft}
            onResume={resumeApplication}
          />
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <RecruiterBrand recruiter={campaign?.tenants ?? null} compact />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Application wizard
                  </p>
                  <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
                    {campaign?.job_title ?? "Apply"}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[campaign?.location, campaign?.employment_type].filter(Boolean).join(" - ") ||
                      "Structured candidate application"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lastSavedAt
                      ? `Saved automatically on this device at ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Your progress is saved automatically on this device."}
                  </p>
                </div>
              </div>
              <Button type="button" variant="ghost" onClick={() => setStarted(false)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Vacancy details
              </Button>
            </div>

            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (currentStep === "review") requestSubmission();
                else continueApplication();
              }}
            >
              <ApplicationProgress steps={applicationSteps} activeStep={wizardStep} />

              {currentStep === "contact" ? (
                <>
                  {/* ── Contact details ── */}
                  <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                    <SectionHeading
                      icon={CircleUserRound}
                      title="Contact details"
                      subtitle="Use the details where the recruiter can reach you."
                    />
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <Field label="First name" htmlFor="first_name">
                        <Input
                          id="first_name"
                          required
                          maxLength={80}
                          value={form.first_name}
                          onChange={(event) => set("first_name")(event.target.value)}
                        />
                      </Field>
                      <Field label="Last name" htmlFor="last_name">
                        <Input
                          id="last_name"
                          required
                          maxLength={80}
                          value={form.last_name}
                          onChange={(event) => set("last_name")(event.target.value)}
                        />
                      </Field>
                      <Field label="Email" htmlFor="email">
                        <Input
                          id="email"
                          type="email"
                          required
                          maxLength={255}
                          value={form.email}
                          onChange={(event) => set("email")(event.target.value)}
                        />
                      </Field>
                      <Field label="Phone" htmlFor="phone" hint={"Include country code, e.g. " + (DIAL_CODES[form.country] ?? '+265') + " 991 234 567. Do not start with 0."}>
                        <Input
                          id="phone"
                          inputMode="tel"
                          maxLength={40}
                          placeholder={DIAL_CODES[form.country] ?? '+265 991 234 567'}
                          value={form.phone}
                          onChange={(event) => set("phone")(event.target.value)}
                        />
                      </Field>
                      <Field label="Country" htmlFor="country">
                        <Select
                          value={form.country}
                          onValueChange={(value) =>
                            setForm((previous) => { const prefix = DIAL_CODES[value] ?? previous.phone.split(' ').slice(0, previous.phone.startsWith('+') ? 1 : 0).join(' '); return { ...previous, country: value, city: "", phone: previous.phone.startsWith('+') ? previous.phone : (prefix ? prefix + ' ' : '') + previous.phone }; })
                          }
                        >
                          <SelectTrigger id="country">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {APPLICANT_COUNTRIES.map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="City" htmlFor="city">
                        <Input
                          id="city"
                          list="city-suggestions"
                          maxLength={120}
                          placeholder={
                            form.country ? "Select or type your city" : "Select a country first"
                          }
                          value={form.city}
                          onChange={(event) => set("city")(event.target.value)}
                        />
                        <datalist id="city-suggestions">
                          {citySuggestions.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </Field>
                      <Field label="Area or suburb" htmlFor="location" className="sm:col-span-2">
                        <Input
                          id="location"
                          maxLength={160}
                          placeholder="Optional"
                          value={form.location}
                          onChange={(event) => set("location")(event.target.value)}
                        />
                      </Field>
                    </div>
                  </section>

                  {/* ── Professional profile ── */}
                  <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                    <SectionHeading
                      icon={CircleUserRound}
                      title="Professional profile"
                      subtitle="A concise summary makes your experience easier to assess."
                    />
                    <div className="mt-5 space-y-4">
                      <Field label="Professional summary" htmlFor="professional_summary">
                        <Textarea
                          id="professional_summary"
                          rows={6}
                          maxLength={3000}
                          placeholder="Summarise your career focus, strongest experience, and the value you bring."
                          value={form.professional_summary}
                          onChange={(event) => set("professional_summary")(event.target.value)}
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="LinkedIn profile" htmlFor="linkedin_url">
                          <Input
                            id="linkedin_url"
                            type="url"
                            maxLength={500}
                            placeholder="https://linkedin.com/in/..."
                            value={form.linkedin_url}
                            onChange={(event) => set("linkedin_url")(event.target.value)}
                          />
                        </Field>
                        <Field label="Portfolio or professional website" htmlFor="portfolio_url">
                          <Input
                            id="portfolio_url"
                            type="url"
                            maxLength={500}
                            placeholder="https://..."
                            value={form.portfolio_url}
                            onChange={(event) => set("portfolio_url")(event.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  </section>

                  {/* ── Skills ── */}
                  <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                    <SectionHeading
                      icon={Wrench}
                      title="Skills"
                      subtitle="Choose skills from the role and catalog so they can be matched consistently."
                    />
                    {(campaign?.required_skills?.length ?? 0) > 0 ? (
                      <div className="mt-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Role-required skills
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {campaign?.required_skills?.map((skill) => (
                            <Button
                              key={skill}
                              type="button"
                              size="sm"
                              variant={
                                skills.some(
                                  (selected) => selected.toLowerCase() === skill.toLowerCase(),
                                )
                                  ? "secondary"
                                  : "outline"
                              }
                              onClick={() => addSkill(skill)}
                            >
                              {skills.some(
                                (selected) => selected.toLowerCase() === skill.toLowerCase(),
                              ) ? (
                                <CheckCircle2 className="mr-1.5 size-3.5" />
                              ) : (
                                <Plus className="mr-1.5 size-3.5" />
                              )}
                              {skill}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-5 flex gap-2">
                      <Input
                        list="skill-suggestions"
                        maxLength={80}
                        placeholder="Select or type a skill"
                        value={skillInput}
                        onChange={(event) => setSkillInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSkill();
                          }
                        }}
                      />
                      <IconButton label="Add skill" onClick={() => addSkill()}>
                        <Plus className="size-4" />
                      </IconButton>
                    </div>
                    <datalist id="skill-suggestions">
                      {skillSuggestions.map((skill) => (
                        <option key={skill} value={skill} />
                      ))}
                    </datalist>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 py-1 pl-2 pr-1 text-sm"
                        >
                          {skill}
                          <IconButton
                            label={`Remove ${skill}`}
                            className="size-6"
                            onClick={() =>
                              setSkills((current) => current.filter((item) => item !== skill))
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </span>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {currentStep === "education" ? (
                <>
                <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <SectionHeading
                    icon={GraduationCap}
                    title="Education"
                    subtitle="Add completed qualifications, beginning with the highest level."
                  />
                  <div className="mt-5 space-y-5">
                    {education.map((entry, index) => (
                      <div key={index} className="rounded-lg border border-border/80 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium">Qualification {index + 1}</p>
                          {education.length > 1 ? (
                            <IconButton
                              label="Remove qualification"
                              onClick={() =>
                                setEducation((entries) =>
                                  entries.filter((_, entryIndex) => entryIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <Field label="Qualification" htmlFor={`qualification-${index}`}>
                            <Select
                              value={entry.qualification}
                              onValueChange={(value) =>
                                updateEducation(index, { qualification: value })
                              }
                            >
                              <SelectTrigger id={`qualification-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {QUALIFICATION_LEVELS.map((level) => (
                                  <SelectItem key={level} value={level}>
                                    {level}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Field of study" htmlFor={`study-${index}`}>
                            <Input
                              id={`study-${index}`}
                              list="field-of-study-suggestions"
                              maxLength={120}
                              placeholder="Select or type a field"
                              value={entry.field_of_study}
                              onChange={(event) =>
                                updateEducation(index, { field_of_study: event.target.value })
                              }
                              onBlur={(event) => applyFieldOfStudy(index, event.target.value)}
                            />
                          </Field>
                          <Field label="Institution" htmlFor={`institution-${index}`}>
                            <UniversitySearch
                              id={`institution-${index}`}
                              value={entry.institution}
                              country={entry.country || form.country}
                              onPick={(name) => updateEducation(index, { institution: name })}
                              onClear={() => updateEducation(index, { institution: "" })}
                            />
                          </Field>
                          <Field
                            label="Country of institution"
                            htmlFor={`education-country-${index}`}
                          >
                            <Select
                              value={entry.country || form.country}
                              onValueChange={(value) => updateEducation(index, { country: value })}
                            >
                              <SelectTrigger id={`education-country-${index}`}>
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                              <SelectContent>
                                {APPLICANT_COUNTRIES.map((country) => (
                                  <SelectItem key={country} value={country}>
                                    {country}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Start year" htmlFor={`start-year-${index}`}>
                            <Input
                              id={`start-year-${index}`}
                              type="number"
                              min="1950"
                              max="2100"
                              value={entry.start_year}
                              onChange={(event) =>
                                updateEducation(index, { start_year: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Completion year" htmlFor={`end-year-${index}`}>
                            <Input
                              id={`end-year-${index}`}
                              type="number"
                              min="1950"
                              max="2100"
                              value={entry.end_year}
                              onChange={(event) =>
                                updateEducation(index, { end_year: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                  <datalist id="field-of-study-suggestions">
                    {fieldStudySuggestions.map((field: string) => (
                      <option key={field} value={field} />
                    ))}
                  </datalist>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5"
                    onClick={() =>
                      setEducation((entries) => [...entries, emptyEducation(form.country)])
                    }
                  >
                    <Plus className="mr-2 size-4" />
                    Add another qualification
                  </Button>
                </section>

                {/* ── Certifications ── */}
                <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <SectionHeading
                    icon={Award}
                    title="Certifications"
                    subtitle="Add professional certifications you hold, so they can be matched to the role's requirements."
                  />
                  {(campaign?.required_certifications?.length ?? 0) > 0 ? (
                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Required for this role
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {campaign?.required_certifications?.map((cert) => (
                          <Button
                            key={cert}
                            type="button"
                            size="sm"
                            variant={
                              certifications.some(
                                (held) => held.toLowerCase() === cert.toLowerCase(),
                              )
                                ? "secondary"
                                : "outline"
                            }
                            onClick={() => addCertification(cert)}
                          >
                            {certifications.some(
                              (held) => held.toLowerCase() === cert.toLowerCase(),
                            ) ? (
                              <CheckCircle2 className="mr-1.5 size-3.5" />
                            ) : (
                              <Plus className="mr-1.5 size-3.5" />
                            )}
                            {cert}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="relative mt-5">
                    <div className="flex gap-2">
                      <Input
                        maxLength={120}
                        placeholder="Search the certification catalog or type a name"
                        value={certificationInput}
                        onChange={(event) => setCertificationInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCertification();
                          }
                        }}
                        onBlur={() =>
                          setTimeout(() => setCertificationOpen(false), 150)
                        }
                      />
                      <IconButton label="Add certification" onClick={() => addCertification()}>
                        <Plus className="size-4" />
                      </IconButton>
                    </div>
                    {certificationOpen ? (
                      <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
                        {certificationHits.length ? (
                          <ul className="max-h-56 overflow-auto py-1">
                            {certificationHits.map((entry) => (
                              <li key={entry.id}>
                                <button
                                  type="button"
                                  className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setCertificationInput(entry.name);
                                    setCertificationOpen(false);
                                    addCertification(entry.name);
                                  }}
                                >
                                  <span className="font-medium">{entry.name}</span>
                                  {entry.full_name ? (
                                    <span className="text-xs text-muted-foreground">
                                      {entry.full_name}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-3 py-2 text-sm text-muted-foreground">
                            No certifications found — you can still type the name.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {certifications.map((cert) => (
                      <span
                        key={cert}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 py-1 pl-2 pr-1 text-sm"
                      >
                        {cert}
                        <IconButton
                          label={`Remove ${cert}`}
                          className="size-6"
                          onClick={() =>
                            setCertifications((current) => current.filter((item) => item !== cert))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </span>
                    ))}
                  </div>
                </section>
              </>
              ) : null}

              {currentStep === "experience" ? (
                <>
                <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <SectionHeading
                    icon={BriefcaseBusiness}
                    title="Experience"
                    subtitle="Add each relevant employer. Overlapping dates are counted once in your total."
                  />
                  <div className="mt-5 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">
                      Total structured experience:
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {formatExperienceYears(totalExperience)}
                    </span>
                  </div>
                  <div className="mt-5 space-y-5">
                    {experience.map((entry, index) => (
                      <div key={index} className="rounded-lg border border-border/80 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium">Work experience {index + 1}</p>
                          {experience.length > 1 ? (
                            <IconButton
                              label="Remove work experience"
                              onClick={() =>
                                setExperience((entries) =>
                                  entries.filter((_, entryIndex) => entryIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <Field label="Employer" htmlFor={`employer-${index}`}>
                            <Input
                              id={`employer-${index}`}
                              maxLength={160}
                              value={entry.employer}
                              onChange={(event) =>
                                updateExperience(index, { employer: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Position" htmlFor={`position-${index}`}>
                            <OccupationSearch
                              id={`position-${index}`}
                              value={entry.position}
                              onPick={(name) => updateExperience(index, { position: name })}
                            />
                          </Field>
                          <Field label="Field of work" htmlFor={`work-field-${index}`}>
                            <Select
                              value={entry.field}
                              onValueChange={(value) =>
                                updateExperience(index, { field: value })
                              }
                            >
                              <SelectTrigger id={`work-field-${index}`}>
                                <SelectValue placeholder="Select the field of work" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {(familySuggestions.length
                                  ? familySuggestions
                                  : FALLBACK_FAMILIES.map((f) => f.name)
                                ).map((name: string) => (
                                  <SelectItem key={name} value={name}>
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Start date" htmlFor={`start-date-${index}`}>
                            <Input
                              id={`start-date-${index}`}
                              type="date"
                              value={entry.start_date}
                              onChange={(event) =>
                                updateExperience(index, { start_date: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="End date" htmlFor={`end-date-${index}`}>
                            <Input
                              id={`end-date-${index}`}
                              type="date"
                              disabled={entry.is_current}
                              value={entry.is_current ? "" : entry.end_date}
                              onChange={(event) =>
                                updateExperience(index, { end_date: event.target.value })
                              }
                            />
                          </Field>
                          <div className="flex items-center gap-3 sm:col-span-2">
                            <Checkbox
                              id={`current-${index}`}
                              checked={entry.is_current}
                              onCheckedChange={(checked) =>
                                updateExperience(index, {
                                  is_current: checked === true,
                                  end_date: checked === true ? "" : entry.end_date,
                                })
                              }
                            />
                            <Label htmlFor={`current-${index}`}>
                              I currently work in this role
                            </Label>
                          </div>
                          <Field
                            label="Key responsibilities"
                            htmlFor={`responsibilities-${index}`}
                            className="sm:col-span-2"
                          >
                            <Textarea
                              id={`responsibilities-${index}`}
                              rows={4}
                              maxLength={2000}
                              placeholder="Describe the work you owned, tools used, outcomes, and scope of responsibility."
                              value={entry.responsibilities}
                              onChange={(event) =>
                                updateExperience(index, { responsibilities: event.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label="Reason for leaving"
                            htmlFor={`reason-${index}`}
                            className="sm:col-span-2"
                          >
                            <Input
                              id={`reason-${index}`}
                              maxLength={500}
                              placeholder="Optional"
                              value={entry.reason_for_leaving}
                              onChange={(event) =>
                                updateExperience(index, { reason_for_leaving: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5"
                    onClick={() => setExperience((entries) => [...entries, emptyExperience()])}
                  >
                    <Plus className="mr-2 size-4" />
                    Add another experience
                  </Button>
                </section>

                {/* ── Professional references ── */}
                <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <SectionHeading
                    icon={UserRoundCheck}
                    title="Professional references"
                    subtitle={`Add ${campaign?.referee_count ?? 2} people who can verify your work.`}
                  />
                  <div className="mt-5 space-y-5">
                    {referees.map((entry, index) => (
                      <div key={index} className="rounded-lg border border-border/80 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium">Reference {index + 1}</p>
                          {referees.length > 2 ? (
                            <IconButton
                              label="Remove reference"
                              onClick={() =>
                                setReferees((entries) =>
                                  entries.filter((_, entryIndex) => entryIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <Field label="Full name" htmlFor={`ref-name-${index}`}>
                            <Input
                              id={`ref-name-${index}`}
                              maxLength={120}
                              value={entry.name}
                              onChange={(event) =>
                                updateReferee(index, { name: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Organisation" htmlFor={`ref-organisation-${index}`}>
                            <Input
                              id={`ref-organisation-${index}`}
                              maxLength={160}
                              value={entry.organisation}
                              onChange={(event) =>
                                updateReferee(index, { organisation: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Position" htmlFor={`ref-position-${index}`}>
                            <Input
                              id={`ref-position-${index}`}
                              maxLength={120}
                              value={entry.position}
                              onChange={(event) =>
                                updateReferee(index, { position: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Relationship" htmlFor={`ref-relationship-${index}`}>
                            <Input
                              id={`ref-relationship-${index}`}
                              maxLength={120}
                              placeholder="e.g. Direct manager"
                              value={entry.relationship}
                              onChange={(event) =>
                                updateReferee(index, { relationship: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Email" htmlFor={`ref-email-${index}`}>
                            <Input
                              id={`ref-email-${index}`}
                              type="email"
                              maxLength={255}
                              value={entry.email}
                              onChange={(event) =>
                                updateReferee(index, { email: event.target.value })
                              }
                            />
                          </Field>
                          <Field label="Phone" htmlFor={`ref-phone-${index}`} hint={"Include country code, e.g. " + (DIAL_CODES[form.country] ?? '+265') + " 991 234 567"}>
                            <Input
                              id={`ref-phone-${index}`}
                              inputMode="tel"
                              maxLength={40}
                              placeholder={DIAL_CODES[form.country] ?? '+265 991 234 567'}
                              value={entry.phone}
                              onChange={(event) =>
                                updateReferee(index, { phone: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5"
                    onClick={() => setReferees((entries) => [...entries, emptyReferee()])}
                  >
                    <Plus className="mr-2 size-4" />
                    Add another reference
                  </Button>
                </section>
              </>
              ) : null}




              {currentStep === "documents" ? (
                <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <SectionHeading
                    icon={FileText}
                    title="Documents"
                    subtitle="Upload the documents requested for this vacancy — PDF, DOC, DOCX, images or text, up to 10 MB each."
                  />
                  <div className="mt-5 space-y-4">
                    {(campaign?.required_documents ?? []).map((docType) => {
                      const file = uploadedFiles[docType];
                      const restored = restoredDocuments[docType];
                      return (
                        <div key={docType} className="rounded-lg border border-border/80 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-medium">{docType}</p>
                            {file ? (
                              <IconButton
                                label={`Remove ${docType}`}
                                onClick={() => {
                                  setUploadedFiles((current) => {
                                    const next = { ...current };
                                    delete next[docType];
                                    return next;
                                  });
                                }}
                              >
                                <Trash2 className="size-4" />
                              </IconButton>
                            ) : null}
                          </div>
                          {file ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {file.name} · {(file.size / 1024).toFixed(0)} KB
                            </p>
                          ) : restored ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Previously selected: {restored.name} — select the file again to
                              include it.
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">No file selected.</p>
                          )}
                          <Label htmlFor={`document-${docType}`} className="sr-only">
                            Upload {docType}
                          </Label>
                          <Input
                            id={`document-${docType}`}
                            type="file"
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.rtf"
                            className="mt-3"
                            onChange={(event) => {
                              const selected = event.target.files?.[0];
                              if (!selected) return;
                              if (selected.size > 10 * 1024 * 1024) {
                                toast.error(`${docType} must be 10 MB or smaller.`);
                                event.target.value = "";
                                return;
                              }
                              setUploadedFiles((current) => ({ ...current, [docType]: selected }));
                              setRestoredDocuments((current) => {
                                const next = { ...current };
                                delete next[docType];
                                return next;
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}


              {currentStep === "screening" && questions?.length ? (
                <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
                  <SectionHeading
                    icon={CheckCircle2}
                    title="Screening"
                    subtitle="Choose the response that best reflects your experience."
                  />
                  <div className="mt-5 space-y-6">
                    {questions.map((question) => {
                      const choices = choicesFor(question);
                      const currentAnswer = answers[question.id];
                      return (
                        <ScreeningQuestion
                          key={question.id}
                          question={question}
                          choices={choices}
                          value={currentAnswer}
                          onChange={(value) =>
                            setAnswers((current) => ({ ...current, [question.id]: value }))
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {currentStep === "review" ? (
                <ApplicationReview
                  form={form}
                  education={education}
                  experience={experience}
                  skills={skills}
                  certifications={certifications}
                  referees={referees}
                  questions={questions ?? []}
                  answers={answers}
                  totalExperience={totalExperience}
                  consentAccepted={consentAccepted}
                  documentCount={Object.keys(uploadedFiles).length}
                  onConsentChange={setConsentAccepted}
                  companyName={campaign?.tenants?.name ?? "the recruiting organisation"}
                />
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={wizardStep === 0}
                  onClick={() => {
                    setWizardStep((value) => Math.max(value - 1, 0));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                {currentStep === "review" ? (
                  <Button type="submit" size="lg" disabled={mutation.isPending}>
                    {mutation.isPending ? "Submitting..." : "Review and submit"}
                  </Button>
                ) : (
                  <Button type="button" size="lg" onClick={continueApplication}>
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </form>
            <AlertDialog open={submitConfirmationOpen} onOpenChange={setSubmitConfirmationOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Once submitted, your details and responses will be shared with the recruiting
                    organisation for this vacancy. You can no longer edit this application here.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={mutation.isPending}>
                    Keep reviewing
                  </AlertDialogCancel>
                  <AlertDialogAction
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Submitting..." : "Yes, submit application"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </main>
    </div>
  );
}

function ApplicationProgress({
  steps,
  activeStep,
}: {
  steps: { id: ApplicationStep; label: string }[];
  activeStep: number;
}) {
  return (
    <nav aria-label="Application progress" className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center gap-2">
        {steps.map((step, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;
          return (
            <li key={step.id} className="flex items-center gap-2">
              {index > 0 ? <span className="h-px w-6 bg-border sm:w-10" /> : null}
              <span
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${active ? "border-primary bg-primary text-primary-foreground" : complete ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
              >
                {complete ? <CheckCircle2 className="h-4 w-4" /> : <span>{index + 1}</span>}
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ScreeningQuestion({
  question,
  choices,
  value,
  onChange,
}: {
  question: Question;
  choices: { label: string; value: string }[];
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const stringValue = typeof value === "string" ? value : "";
  const multiple = Array.isArray(value) ? value : [];
  return (
    <div className="space-y-3">
      <Label htmlFor={`q-${question.id}`}>
        {question.question_text}
        {question.is_mandatory ? <span className="text-destructive"> *</span> : null}
      </Label>
      {question.question_type === "multiple_choice" && choices.length ? (
        <div className="grid gap-2">
          {choices.map((choice) => (
            <label
              key={choice.value}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <Checkbox
                checked={multiple.includes(choice.value)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...multiple, choice.value]
                      : multiple.filter((item) => item !== choice.value),
                  )
                }
              />
              {choice.label}
            </label>
          ))}
        </div>
      ) : choices.length ? (
        <Select value={stringValue} onValueChange={onChange}>
          <SelectTrigger id={`q-${question.id}`}>
            <SelectValue placeholder="Select an answer" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : question.question_type === "number" ? (
        <Input
          id={`q-${question.id}`}
          type="number"
          min={0}
          required={Boolean(question.is_mandatory)}
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Textarea
          id={`q-${question.id}`}
          rows={3}
          maxLength={1000}
          required={Boolean(question.is_mandatory)}
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function ApplicationReview({
  form,
  education,
  experience,
  skills,
  referees,
  questions,
  answers,
  totalExperience,
  documentCount,
  consentAccepted,
  onConsentChange,
  companyName,
  certifications,
}: {
  form: PersonalForm;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  skills: string[];
  certifications: string[];
  referees: RefereeEntry[];
  questions: Question[];
  answers: Record<string, string | string[]>;
  totalExperience: number;
  documentCount: number;
  consentAccepted: boolean;
  onConsentChange: (accepted: boolean) => void;
  companyName: string;
}) {
  const answered = questions.filter((question) => !isBlankAnswer(answers[question.id])).length;
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <SectionHeading
        icon={CheckCircle2}
        title="Review your application"
        subtitle="Check the structured CV details before submitting."
      />
      <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <ReviewItem label="Name" value={`${form.first_name} ${form.last_name}`.trim()} />
        <ReviewItem label="Location" value={[form.city, form.country].filter(Boolean).join(", ")} />
        <ReviewItem
          label="Education"
          value={`${education.length} qualification${education.length === 1 ? "" : "s"}`}
        />
        <ReviewItem label="Experience" value={formatExperienceYears(totalExperience)} />
        <ReviewItem label="Skills" value={`${skills.length} selected`} />
        <ReviewItem
          label="Certifications"
          value={`${certifications.length} selected`}
        />
        <ReviewItem label="Documents" value={`${documentCount} uploaded`} />
        <ReviewItem
          label="References"
          value={`${referees.filter((referee) => referee.name.trim()).length} added`}
        />
        {questions.length ? (
          <ReviewItem
            label="Screening answers"
            value={`${answered} of ${questions.length} answered`}
          />
        ) : null}
      </dl>
      <div className="mt-6 rounded-md border border-border bg-secondary/30 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="application-consent"
            checked={consentAccepted}
            onCheckedChange={(checked) => onConsentChange(checked === true)}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="application-consent" className="cursor-pointer leading-5">
              I consent to {companyName} processing the personal information in this application for
              recruitment and candidate assessment.
            </Label>
            <p className="text-xs leading-5 text-muted-foreground">
              I confirm that the information I have provided is accurate. You can withdraw from the
              process by contacting the recruiting organisation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function VacancyOverview({
  campaign,
  isLoading,
  descriptionSections,
  onApply,
  savedDraft,
  onResume,
}: {
  campaign: CampaignSummary | null;
  isLoading: boolean;
  descriptionSections: DescriptionSection[];
  onApply: () => void;
  savedDraft: ApplicationDraft | null;
  onResume: () => void;
}) {
  const responsibilities = campaign?.responsibilities?.filter(Boolean) ?? [];
  const requiredSkills = campaign?.required_skills?.filter(Boolean) ?? [];
  const requiredCertifications = campaign?.required_certifications?.filter(Boolean) ?? [];
  const requiredDocuments = campaign?.required_documents?.filter(Boolean) ?? [];
  const hasResponsibilitiesSection = descriptionSections.some((section) =>
    section.title.toLowerCase().includes("responsibil"),
  );
  if (isLoading)
    return (
      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading vacancy details...</p>
      </section>
    );
  if (!campaign)
    return (
      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-semibold">Vacancy not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This application link may have expired or the role is no longer accepting applications.
        </p>
        <Button asChild className="mt-6">
          <Link to="/jobs">View open roles</Link>
        </Button>
      </section>
    );
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <RecruiterBrand recruiter={campaign.tenants} />
            <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Open vacancy
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {campaign.job_title ?? campaign.name ?? "Open role"}
            </h1>
            {campaign.name && campaign.name !== campaign.job_title ? (
              <p className="mt-2 text-sm text-muted-foreground">{campaign.name}</p>
            ) : null}
          </div>
          <Button type="button" size="lg" onClick={onApply}>
            Apply now
          </Button>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem
            icon={MapPin}
            label="Location"
            value={campaign.location ?? "Location flexible"}
          />
          <MetaItem
            icon={BriefcaseBusiness}
            label="Employment"
            value={campaign.employment_type ?? "Not specified"}
          />
          <MetaItem
            icon={GraduationCap}
            label="Minimum qualification"
            value={campaign.min_qualification ?? "Not specified"}
          />
          <MetaItem
            icon={CalendarDays}
            label="Closing date"
            value={formatDate(campaign.closing_date) ?? "Open until filled"}
          />
        </div>
      </section>
      {savedDraft ? (
        <section className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Resume your saved application</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Progress from {formatDateTime(savedDraft.saved_at)} is available on this device.
            </p>
          </div>
          <Button type="button" onClick={onResume}>
            Resume application
          </Button>
        </section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {descriptionSections.length ? (
            descriptionSections.map((section, index) => (
              <VacancySection key={`${section.title}-${index}`} title={section.title}>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
                {section.bullets.length ? (
                  <ul className="space-y-2">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex gap-2 text-sm leading-6 text-muted-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </VacancySection>
            ))
          ) : (
            <VacancySection title="Role overview">
              <p className="text-sm leading-7 text-muted-foreground">
                Review the role details and submit a structured application for screening.
              </p>
            </VacancySection>
          )}
          {responsibilities.length > 0 && !hasResponsibilitiesSection ? (
            <VacancySection title="Key responsibilities">
              <ul className="space-y-2">
                {responsibilities.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </VacancySection>
          ) : null}
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold">Vacancy summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Recruiter" value={campaign.tenants?.name ?? null} />
              <SummaryRow
                label="Experience"
                value={formatExperience(campaign.min_experience_years)}
              />
              <SummaryRow label="Salary" value={formatSalary(campaign)} />
              <SummaryRow label="Closes" value={formatDate(campaign.closing_date)} />
            </dl>
            <Button type="button" className="mt-5 w-full" onClick={onApply}>
              Apply
            </Button>
          </section>
          {requiredSkills.length || requiredCertifications.length || requiredDocuments.length ? (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-base font-semibold">Requirements</h2>
              <RequirementList title="Skills" items={requiredSkills} />
              <RequirementList title="Certifications" items={requiredCertifications} />
              <RequirementList title="Documents" items={requiredDocuments} />
            </section>
          ) : null}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TimerReset className="h-4 w-4 text-primary" />
              Structured screening
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Selections, recorded experience, and published requirements are assessed consistently.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RecruiterBrand({
  recruiter,
  compact = false,
}: {
  recruiter: Recruiter;
  compact?: boolean;
}) {
  const name = recruiter?.name || "Recruiting organisation";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${compact ? "size-11" : "size-14"} grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-secondary text-sm font-semibold text-muted-foreground`}
      >
        {recruiter?.logo_url ? (
          <img
            src={recruiter.logo_url}
            alt={`${name} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <Building2 className={compact ? "size-5" : "size-6"} />
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recruiter
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{name}</p>
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof CircleUserRound;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="font-display text-base font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
function IconButton({
  label,
  children,
  onClick,
  className,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      className={className}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-foreground">{value || "Not supplied"}</dd>
    </div>
  );
}
function VacancySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}
function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
function SummaryRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
function RequirementList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
function isBlankAnswer(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.length === 0 : !value?.trim();
}
/** Maps the campaign's employment-type label to the Google Jobs enum. */
function mapEmploymentType(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  const map: Record<string, string> = {
    "FULL-TIME": "FULL_TIME",
    "FULL TIME": "FULL_TIME",
    FULLTIME: "FULL_TIME",
    "PART-TIME": "PART_TIME",
    "PART TIME": "PART_TIME",
    PARTTIME: "PART_TIME",
    CONTRACT: "CONTRACT",
    TEMPORARY: "TEMPORARY",
    INTERNSHIP: "INTERN",
    INTERN: "INTERN",
    VOLUNTEER: "VOLUNTEER",
    REMOTE: "OTHER",
  };
  return map[normalized] ?? "OTHER";
}

function parseYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : null;
}
function formatExperienceYears(value: number) {
  return value > 0
    ? `${value.toFixed(value % 1 === 0 ? 0 : 1)} year${value === 1 ? "" : "s"}`
    : "No dated experience recorded";
}
function parseList(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [value];
  }
}
function parseJobDescription(value?: string | null): DescriptionSection[] {
  if (!value) return [];
  const sections: DescriptionSection[] = [];
  let current: DescriptionSection | null = null;
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isSectionHeading(line)) {
      current = { title: line, paragraphs: [], bullets: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: "Role overview", paragraphs: [], bullets: [] };
      sections.push(current);
    }
    if (isBulletLine(line)) current.bullets.push(cleanBullet(line));
    else current.paragraphs.push(line);
  }
  return sections;
}
function isSectionHeading(value: string) {
  return [
    "Position Summary",
    "Key Responsibilities",
    "Minimum Requirements",
    "Skills",
    "Working Conditions",
    "Remuneration",
  ].includes(value);
}
function isBulletLine(value: string) {
  return /^(?:-|\u2022|\u00e2\u20ac\u00a2)\s*/.test(value);
}
function cleanBullet(value: string) {
  return value.replace(/^(?:-|\u2022|\u00e2\u20ac\u00a2)\s*/, "");
}
function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(
    date,
  );
}
function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "an earlier session" : date.toLocaleString();
}
function formatExperience(value?: number | null) {
  if (value === null || value === undefined) return null;
  return value <= 0 ? "Entry level" : `${value}+ year${value === 1 ? "" : "s"}`;
}
function formatSalary(campaign: CampaignSummary) {
  const currency = campaign.salary_currency ?? "MWK";
  if (campaign.salary_min && campaign.salary_max)
    return `${currency} ${formatNumber(campaign.salary_min)} - ${formatNumber(campaign.salary_max)}`;
  if (campaign.salary_min) return `${currency} ${formatNumber(campaign.salary_min)}+`;
  if (campaign.salary_max) return `Up to ${currency} ${formatNumber(campaign.salary_max)}`;
  return null;
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
