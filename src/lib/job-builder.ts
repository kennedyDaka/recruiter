/**
 * Structured Recruitment Builder — shared, deterministic model.
 *
 * Everything a recruiter selects is stored as machine-readable values here.
 * No AI: job descriptions, candidate questions and scoring rules are all
 * derived from these structures with plain rules and sentence templates.
 */

export type RequirementLevel = "required" | "preferred" | "not_required";
/** "related" means the field is acceptable but not ideal — still counts toward eligibility. */
export type FieldLevel = RequirementLevel | "related";

export type SkillRequirement = { name: string; category: string; level: RequirementLevel };
export type SoftwareRequirement = { name: string; proficiency: Proficiency };
export type CertificationRequirement = { name: string; level: RequirementLevel };
export type LanguageRequirement = { name: string; level: LanguageLevel };
export type FieldOfStudyRequirement = { name: string; level: FieldLevel };
export type ExperienceAreaRequirement = { name: string; level: FieldLevel };

export type Proficiency = "Basic" | "Intermediate" | "Advanced" | "Expert";
export type LanguageLevel = "Basic" | "Conversational" | "Professional" | "Fluent";

export type Responsibility = {
  action: string;
  object: string;
  /** Optional full duty phrase (e.g. an ESCO skill or O*NET task) used instead
   * of the action/object combo when present. */
  duty?: string;
};

export type ScoreCategory =
  | "qualification"
  | "experience"
  | "skills"
  | "position_relevance"
  | "certifications"
  | "industry"
  | "location";

export type ScoreWeights = Record<ScoreCategory, number>;

export type AnswerOption = {
  label: string;
  value: string;
  points: number;
  disqualifying?: boolean;
};

export type BuilderQuestion = {
  key: string;
  category: ScoreCategory | "license" | "availability" | "location" | "certification" | "other";
  text: string;
  type: "single_choice" | "multiple_choice" | "yes_no" | "number" | "rating" | "short_text";
  options: AnswerOption[];
  mandatory: boolean;
  /** Only show when another question's answer matches. */
  condition?: { key: string; equals: string } | null;
};

/** Legacy category type for backwards compatibility with old questions. */
export type LegacyScoreCategory = "job_experience" | "additional";

export type JobBuilder = {
  hiringReason: string;
  industryId: string | null;
  industryName: string;
  jobFamilyId: string | null;
  jobFamilyName: string;
  /** Which catalog supplied the job family: local DB, external ESCO, or typed. */
  jobFamilySource: "local" | "esco" | "custom" | null;
  jobTitleId: string | null;
  jobTitle: string;
  /** Which catalog supplied the title: local DB, external ESCO, or typed. */
  jobTitleSource: "local" | "esco" | "custom" | null;
  /** External taxonomy reference (e.g. the ESCO occupation URI). */
  jobTitleExternalId: string | null;

  department: string;
  reportsTo: string;
  positions: number;
  employmentType: string;

  country: string;
  region: string;
  city: string;
  workLocation: string;
  specificLocation: string;

  arrangement: string;
  workingDays: string[];
  shiftRequired: boolean;
  shiftType: string;

  minExperience: number;
  maxExperience: number | null;
  experienceAreas: ExperienceAreaRequirement[];
  experienceLevel: string;
  /** Recency window in years — null (default) disables the recency penalty. */
  experienceRecencyYears: number | null;

  minQualification: string;
  fieldsOfStudy: FieldOfStudyRequirement[];
  qualificationLevel: RequirementLevel;

  certifications: CertificationRequirement[];
  skills: SkillRequirement[];
  software: SoftwareRequirement[];

  licenseRequired: boolean;
  licenseType: string;
  licenseClass: string;

  languages: LanguageRequirement[];

  travelRequired: boolean;
  travelFrequency: string;
  relocationRequired: boolean;
  weekendWork: boolean;
  nightWork: boolean;
  physicalWork: boolean;
  driverRequired: boolean;

  showSalary: boolean;
  salaryType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;

  responsibilities: Responsibility[];

  openingDate: string;
  closingDate: string;
  candidateLimit: number | null;
  allowLateApplications: boolean;
  allowEditAfterSubmit: boolean;

  sections: Record<ApplicationSection, boolean>;
  weights: ScoreWeights;
  questions: BuilderQuestion[];

  // Enhanced scoring fields
  /** Highly relevant positions for the role (exact matches). */
  highlyRelevantPositions: string[];
  /** Related positions (predecessors, adjacent roles). */
  relatedPositions: string[];
  /** Industry for industry experience scoring. */
  industry: string;

  // v2 Requirement Groups
  /** Requirement groups for the new eligibility + scoring engine. */
  requirementGroups: import("@/lib/ors-requirements").RequirementGroup[];

  // Branding
  /** Company logo as a data URI (base64). */
  logoData: string | null;
  /** Primary brand color (hex). */
  brandColor: string;
  /** Brand font family. */
  brandFont: string;
  /** Company name displayed on the public application page. */
  companyName: string;
};

export type ApplicationSection =
  | "personal"
  | "education"
  | "experience"
  | "skills"
  | "certifications"
  | "questions"
  | "documents"
  | "referees";

export const APPLICATION_SECTIONS: { key: ApplicationSection; label: string; locked?: boolean }[] =
  [
    { key: "personal", label: "Personal Information", locked: true },
    { key: "education", label: "Education" },
    { key: "experience", label: "Experience" },
    { key: "skills", label: "Skills" },
    { key: "certifications", label: "Certifications" },
    { key: "questions", label: "Job Questions" },
    { key: "documents", label: "Documents" },
    { key: "referees", label: "Referees" },
  ];

export const DEFAULT_WEIGHTS: ScoreWeights = {
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

export const SCORE_CATEGORY_LABELS: Record<ScoreCategory, string> = {
  qualification: "Qualification",
  experience: "Experience",
  skills: "Skills",
  position_relevance: "Position Relevance",
  certifications: "Certifications & Licences",
  industry: "Industry Experience",
  location: "Location",
};

/**
 * ISCO major-group weight profiles. When the recruiter picks an occupation or
 * a job family, the wizard pre-fills these as scoring defaults so every job
 * inherits a sensible blueprint (then lets the recruiter rebalance).
 * Each profile sums to 100.
 */
const ISCO_MAJOR_PROFILES: { label: string; weights: ScoreWeights }[] = [
  {
    label: "Managers",
    weights: { qualification: 10, experience: 20, skills: 15, position_relevance: 35, certifications: 10, industry: 5, location: 5 },
  },
  {
    label: "Professionals",
    weights: { qualification: 15, experience: 20, skills: 20, position_relevance: 25, certifications: 10, industry: 5, location: 5 },
  },
  {
    label: "Technicians",
    weights: { qualification: 15, experience: 20, skills: 25, position_relevance: 20, certifications: 10, industry: 5, location: 5 },
  },
  {
    label: "Clerical",
    weights: { qualification: 15, experience: 15, skills: 20, position_relevance: 25, certifications: 10, industry: 5, location: 10 },
  },
  {
    label: "Services",
    weights: { qualification: 15, experience: 20, skills: 25, position_relevance: 20, certifications: 10, industry: 5, location: 5 },
  },
  {
    label: "Craft",
    weights: { qualification: 10, experience: 20, skills: 30, position_relevance: 20, certifications: 10, industry: 5, location: 5 },
  },
  {
    label: "Operators",
    weights: { qualification: 10, experience: 25, skills: 25, position_relevance: 20, certifications: 10, industry: 5, location: 5 },
  },
  {
    label: "Elementary",
    weights: { qualification: 10, experience: 25, skills: 20, position_relevance: 20, certifications: 10, industry: 10, location: 5 },
  },
];

/**
 * Derives scoring weights from an ESCO occupation/family label. The family
 * label or its ancestor chain (e.g. "Managers", "Professionals", "Craft and
 * related trades workers") is matched against the ISCO major groups; unknown
 * labels fall back to the balanced defaults.
 */
export function weightsForIscoFamily(
  labels: (string | null | undefined)[],
): ScoreWeights {
  const haystack = labels.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return { ...DEFAULT_WEIGHTS };
  const major = ISCO_MAJOR_PROFILES.find((profile) =>
    haystack.includes(profile.label.toLowerCase()),
  );
  if (major) return { ...major.weights };
  // Ancestor labels are descriptive ("Professionals", "Managers") — if none
  // matched, keep the balanced defaults.
  return { ...DEFAULT_WEIGHTS };
}

export const HIRING_REASONS = [
  "New employee",
  "Replacement",
  "Temporary staff",
  "Contract staff",
  "Internship",
  "Graduate trainee",
  "Multiple positions",
];

export const EMPLOYMENT_TYPES = [
  "Permanent",
  "Fixed Term",
  "Contract",
  "Temporary",
  "Internship",
  "Graduate Trainee",
  "Part Time",
  "Casual",
];

export const QUALIFICATIONS = [
  "No formal qualification",
  "MSCE / Secondary",
  "Certificate",
  "Diploma",
  "Advanced Diploma",
  "Bachelor's Degree",
  "Postgraduate Diploma",
  "Master's Degree",
  "Doctorate",
  "Professional Qualification",
];

export function qualificationRank(value?: string | null) {
  if (!value) return 0;
  const index = QUALIFICATIONS.findIndex((q) => q.toLowerCase() === value.trim().toLowerCase());
  return index < 0 ? 0 : index;
}

export const FIELDS_OF_STUDY = [
  "Actuarial Science",
  "Logistics",
  "Supply Chain Management",
  "Transport Management",
  "Aviation Management",
  "Maritime Studies",
  "Customs and Excise",
  "Procurement and Supply",
  "Business Administration",
  "Business Management",
  "Business Analytics",
  "Business Information Systems",
  "Entrepreneurship",
  "Office Administration",
  "Records and Information Management",
  "Secretarial Studies",
  "Accounting",
  "Auditing",
  "Taxation",
  "Banking",
  "Finance",
  "Economics",
  "Investment and Portfolio Management",
  "Insurance and Risk Management",
  "Human Resource Management",
  "Industrial Relations",
  "Labour Relations",
  "Marketing",
  "Digital Marketing",
  "Sales Management",
  "Customer Relationship Management",
  "Project Management",
  "Operations Management",
  "Information Technology",
  "Computer Science",
  "Software Engineering",
  "Computer Engineering",
  "Information Systems",
  "Data Science",
  "Data Analytics",
  "Artificial Intelligence",
  "Cybersecurity",
  "Network Engineering",
  "Cloud Computing",
  "Geographic Information Systems",
  "Mathematics",
  "Statistics",
  "Physics",
  "Chemistry",
  "Biochemistry",
  "Biotechnology",
  "Laboratory Science",
  "Engineering",
  "Civil Engineering",
  "Structural Engineering",
  "Electrical Engineering",
  "Electronics Engineering",
  "Mechanical Engineering",
  "Mechatronics Engineering",
  "Chemical Engineering",
  "Industrial Engineering",
  "Manufacturing Engineering",
  "Mining Engineering",
  "Metallurgical Engineering",
  "Petroleum Engineering",
  "Environmental Engineering",
  "Water Engineering",
  "Renewable Energy Engineering",
  "Automotive Engineering",
  "Telecommunications Engineering",
  "Architecture",
  "Quantity Surveying",
  "Land Surveying",
  "Construction Management",
  "Urban and Regional Planning",
  "Education",
  "Early Childhood Development",
  "Primary Education",
  "Secondary Education",
  "Special Needs Education",
  "Educational Leadership",
  "Curriculum Studies",
  "Training and Development",
  "Agriculture",
  "Agronomy",
  "Horticulture",
  "Animal Science",
  "Veterinary Science",
  "Agribusiness",
  "Food Science and Technology",
  "Fisheries and Aquaculture",
  "Forestry",
  "Natural Resource Management",
  "Environmental Science",
  "Climate Change and Sustainability",
  "Conservation Biology",
  "Public Administration",
  "Public Policy",
  "Development Studies",
  "International Development",
  "Monitoring and Evaluation",
  "Population Studies",
  "Disaster Risk Management",
  "Community Development",
  "Social Work",
  "Sociology",
  "Psychology",
  "Counselling",
  "Gender Studies",
  "Political Science",
  "International Relations",
  "Law",
  "Commercial Law",
  "Human Rights Law",
  "Criminology",
  "Forensic Science",
  "Health Sciences",
  "Medicine",
  "Clinical Medicine",
  "Nursing",
  "Midwifery",
  "Public Health",
  "Pharmacy",
  "Pharmaceutical Sciences",
  "Medical Laboratory Science",
  "Radiography",
  "Physiotherapy",
  "Occupational Therapy",
  "Nutrition and Dietetics",
  "Dental Surgery",
  "Health Services Management",
  "Hospitality Management",
  "Tourism Management",
  "Travel and Tourism",
  "Culinary Arts",
  "Hotel Management",
  "Event Management",
  "Sports Management",
  "Physical Education",
  "Media and Communications",
  "Journalism",
  "Public Relations",
  "Broadcasting",
  "Film and Television Production",
  "Graphic Design",
  "Fine Art",
  "Fashion Design",
  "Interior Design",
  "Performing Arts",
  "Languages and Linguistics",
  "Translation and Interpretation",
  "Library and Information Science",
  "Theology and Religious Studies",
  "Security Management",
  "Peace and Conflict Studies",
  "Waste Management",
  "Occupational Health and Safety",
];

export const EXPERIENCE_LEVELS = [
  "Entry level",
  "Junior",
  "Mid-level",
  "Senior",
  "Managerial",
  "Executive",
];

export const WORK_LOCATIONS = [
  "Office",
  "Warehouse",
  "Field",
  "Remote",
  "Hybrid",
  "Multiple locations",
];

export const ARRANGEMENTS = ["Full time", "Part time", "Shift work", "Flexible"];
export const SHIFT_TYPES = ["Day", "Night", "Rotating", "Custom"];
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const TRAVEL_FREQUENCIES = ["None", "Occasionally", "Frequently", "Constantly"];
export const PROFICIENCIES: Proficiency[] = ["Basic", "Intermediate", "Advanced", "Expert"];
export const LANGUAGE_LEVELS: LanguageLevel[] = [
  "Basic",
  "Conversational",
  "Professional",
  "Fluent",
];
export const LANGUAGES = [
  "English",
  "Chichewa",
  "Tumbuka",
  "Yao",
  "French",
  "Portuguese",
  "Swahili",
];
export const SALARY_TYPES = ["Monthly", "Weekly", "Daily", "Hourly"];
export const CURRENCIES = ["MWK", "ZMW", "USD", "ZAR", "GBP", "EUR"];

export const COUNTRIES: Record<string, Record<string, string[]>> = {
  Malawi: {
    Northern: ["Mzuzu", "Karonga", "Rumphi", "Nkhata Bay", "Mzimba", "Chitipa", "Likoma"],
    Central: [
      "Lilongwe",
      "Kasungu",
      "Salima",
      "Dedza",
      "Ntchisi",
      "Dowa",
      "Mchinji",
      "Nkhotakota",
      "Ntcheu",
    ],
    Southern: [
      "Blantyre",
      "Zomba",
      "Mangochi",
      "Mulanje",
      "Thyolo",
      "Chikwawa",
      "Nsanje",
      "Balaka",
      "Machinga",
      "Phalombe",
      "Neno",
      "Chiradzulu",
    ],
  },
  Zambia: { Lusaka: ["Lusaka", "Kafue", "Chongwe"], Copperbelt: ["Ndola", "Kitwe", "Chingola"] },
  Zimbabwe: { Harare: ["Harare", "Chitungwiza"], Bulawayo: ["Bulawayo"] },
  "South Africa": {
    Gauteng: ["Johannesburg", "Pretoria", "Ekurhuleni"],
    "Western Cape": ["Cape Town", "Stellenbosch"],
    "KwaZulu-Natal": ["Durban", "Pietermaritzburg"],
  },
  Tanzania: { "Dar es Salaam": ["Dar es Salaam"], Arusha: ["Arusha"] },
};

export const ACTION_VERBS = [
  "Administer",
  "Advise",
  "Analyse",
  "Assess",
  "Collaborate on",
  "Communicate",
  "Manage",
  "Supervise",
  "Coordinate",
  "Deliver",
  "Design",
  "Develop",
  "Direct",
  "Document",
  "Evaluate",
  "Facilitate",
  "Implement",
  "Improve",
  "Inspect",
  "Investigate",
  "Lead",
  "Monitor",
  "Negotiate",
  "Optimise",
  "Prepare",
  "Maintain",
  "Review",
  "Ensure",
  "Support",
  "Control",
  "Plan",
  "Train",
];

/**
 * Action verbs that mark a catalog phrase as a duty ("prepare tax returns",
 * "attach accounting certificates") rather than a skill ("tax legislation",
 * "bookkeeping"). Used when auto-importing ESCO essential skills so only
 * real skill-type entries land in the required-skills list — duty phrases
 * still become Key Responsibilities, just not skills.
 */
export const DUTY_START_VERBS = new Set([
  ...ACTION_VERBS.map((verb) => verb.toLowerCase()),
  // Common duty phrasings not in the action-verb builder list.
  "explain",
  "follow",
  "prepare",
  "draft",
  "attach",
  "calculate",
  "inspect",
  "supervise",
  "report",
  "perform",
  "ensure",
  "develop",
  "maintain",
  "manage",
  "provide",
  "conduct",
  "monitor",
  "review",
  "support",
  "direct",
  "coordinate",
  "deliver",
  "design",
  "implement",
  "improve",
  "investigate",
  "lead",
  "negotiate",
  "optimise",
  "plan",
  "train",
  "administer",
  "advise",
  "analyse",
  "assess",
  "collaborate",
  "communicate",
  "document",
  "evaluate",
  "facilitate",
  "control",
  "verify",
  "record",
  "check",
  "examine",
  "identify",
  "resolve",
  "register",
  "compile",
  "update",
  "handle",
  "assist",
  "organise",
  "arrange",
  "liaise",
  "operate",
  "complete",
  "issue",
  "collect",
  "distribute",
  "pack",
  "load",
  "unload",
  "sort",
  "store",
  "count",
  "weigh",
  "interpret",
  "apply",
  "establish",
  "execute",
  "undertake",
  "carry",
  "run",
  "set",
  "build",
  "create",
  "write",
  "read",
  "input",
  "enter",
  "file",
  "post",
  "submit",
  "reconcile",
  "verify",
  "trace",
  "track",
  "log",
]);

/** Whether a catalog phrase reads as a duty (verb-first) rather than a skill. */
export function looksLikeDuty(name: string): boolean {
  const first = name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return DUTY_START_VERBS.has(first);
}

/** Objects offered to the responsibility builder, keyed by job family. */
export const RESPONSIBILITY_OBJECTS: Record<string, string[]> = {
  default: [
    "daily operations",
    "team performance",
    "operational reports",
    "departmental budgets",
    "work schedules",
    "compliance with company policy",
    "customer requirements",
    "records and documentation",
    "quality standards",
    "health and safety standards",
    "risk registers and mitigation actions",
    "internal controls",
    "stakeholder relationships",
    "service delivery standards",
    "continuous improvement initiatives",
    "training and development plans",
    "resource allocation",
    "project milestones",
    "data quality",
    "confidential information",
    "customer feedback",
    "vendor and partner performance",
    "business continuity plans",
    "environmental and social safeguards",
    "change management activities",
    "procurement and approval workflows",
    "performance indicators",
    "asset registers",
    "escalations and incident reports",
    "cross-functional collaboration",
  ],
  Warehouse: [
    "warehouse operations",
    "warehouse staff",
    "inventory levels",
    "stock accuracy",
    "receiving and dispatch activities",
    "stock counts",
    "warehouse safety",
    "storage layout",
    "goods received notes",
  ],
  Fleet: [
    "fleet operations",
    "vehicle maintenance",
    "drivers",
    "fuel consumption",
    "trip schedules",
    "vehicle records",
    "roadworthiness compliance",
    "route optimisation",
  ],
  "Supply Chain": [
    "supply chain performance",
    "supplier relationships",
    "demand forecasts",
    "procurement plans",
    "delivery schedules",
    "supply risks",
    "warehouse-to-customer fulfilment",
  ],
  Inventory: [
    "inventory levels",
    "stock records",
    "stock counts",
    "reorder levels",
    "stock variances",
    "inventory ageing",
    "cycle counting",
  ],
  Procurement: [
    "procurement processes",
    "supplier contracts",
    "purchase orders",
    "tender evaluations",
    "supplier performance",
    "bid documentation",
    "contract compliance",
  ],
  Accounting: [
    "financial records",
    "monthly reconciliations",
    "management accounts",
    "payment processing",
    "audit preparation",
    "general ledger accuracy",
    "tax documentation",
  ],
  "Financial Management": [
    "financial performance",
    "budgets and forecasts",
    "cash flow",
    "financial controls",
    "statutory reporting",
    "investment decisions",
    "financial risk",
  ],
  "HR Generalist": [
    "recruitment processes",
    "employee records",
    "performance reviews",
    "disciplinary processes",
    "staff welfare",
    "employee relations",
    "HR policy implementation",
  ],
  Recruitment: [
    "candidate pipelines",
    "job advertisements",
    "interview schedules",
    "selection records",
    "onboarding activities",
    "recruitment metrics",
  ],
  Software: [
    "application development",
    "code quality",
    "technical documentation",
    "system releases",
    "bug resolution",
    "software testing",
    "application security",
  ],
  Infrastructure: [
    "network availability",
    "server infrastructure",
    "user support requests",
    "system backups",
    "IT security",
    "access controls",
    "disaster recovery",
  ],
  "Data and Analytics": [
    "data pipelines",
    "data quality",
    "dashboards",
    "analytical models",
    "data governance",
    "reporting automation",
  ],
  "Store Operations": [
    "store operations",
    "sales targets",
    "shop floor staff",
    "merchandising standards",
    "stock replenishment",
    "cash controls",
    "customer experience",
  ],
  "Business Development": [
    "sales pipeline",
    "client proposals",
    "key accounts",
    "market opportunities",
    "revenue targets",
    "partnership agreements",
  ],
  Marketing: [
    "marketing campaigns",
    "brand guidelines",
    "content calendars",
    "campaign performance",
    "market research",
    "lead generation",
  ],
  Production: [
    "production schedules",
    "production targets",
    "machine performance",
    "raw material usage",
    "product quality",
    "production downtime",
    "work instructions",
  ],
  "Quality Assurance": [
    "quality management system",
    "inspection records",
    "non-conformances",
    "corrective actions",
    "quality audits",
    "product specifications",
  ],
  Teaching: [
    "lesson delivery",
    "learner assessment",
    "schemes of work",
    "classroom discipline",
    "learner progress reports",
    "curriculum coverage",
    "parent communication",
  ],
  Clinical: [
    "patient care",
    "clinical records",
    "treatment protocols",
    "infection control",
    "medical supplies",
    "referral pathways",
    "patient safety",
  ],
  Nursing: [
    "nursing care plans",
    "medication administration",
    "patient observations",
    "ward handovers",
    "nursing records",
    "infection prevention",
  ],
  "Civil Engineering": [
    "engineering designs",
    "site inspections",
    "construction quality",
    "project drawings",
    "contractor progress",
    "material testing",
  ],
  "Site Management": [
    "site activities",
    "subcontractor coordination",
    "construction schedules",
    "site safety",
    "daily site records",
    "project handover",
  ],
  "Retail Banking": [
    "customer accounts",
    "cash operations",
    "branch service standards",
    "loan referrals",
    "regulatory compliance",
    "branch targets",
  ],
  "Credit and Risk": [
    "credit assessments",
    "risk exposures",
    "credit files",
    "collections activity",
    "risk reports",
    "portfolio quality",
  ],
  Compliance: [
    "compliance monitoring",
    "regulatory returns",
    "policy controls",
    "compliance findings",
    "staff awareness",
    "remediation plans",
  ],
  Programmes: [
    "programme workplans",
    "implementing partners",
    "beneficiary records",
    "donor reporting",
    "project budgets",
    "programme risks",
  ],
  "Monitoring and Evaluation": [
    "monitoring plans",
    "indicator data",
    "evaluation activities",
    "data verification",
    "learning reports",
    "results frameworks",
  ],
  "Environmental Management": [
    "environmental compliance",
    "impact assessments",
    "environmental monitoring",
    "waste controls",
    "environmental permits",
    "sustainability plans",
  ],
  "Network Operations": [
    "network performance",
    "network incidents",
    "service availability",
    "capacity plans",
    "network changes",
    "operational dashboards",
  ],
  "Laboratory Science": [
    "laboratory tests",
    "sample integrity",
    "quality controls",
    "laboratory equipment",
    "test records",
    "biosafety procedures",
  ],
};

export function responsibilityObjectsFor(family: string) {
  return Array.from(
    new Set([...(RESPONSIBILITY_OBJECTS[family] ?? []), ...RESPONSIBILITY_OBJECTS["default"]!]),
  );
}

const DEPARTMENTS_BY_FAMILY: Record<string, string[]> = {
  Warehouse: ["Warehouse Operations", "Distribution", "Stores"],
  Fleet: ["Transport and Fleet", "Logistics Operations", "Distribution"],
  "Supply Chain": ["Supply Chain", "Planning", "Procurement"],
  Procurement: ["Procurement", "Supply Chain", "Finance"],
  Accounting: ["Finance", "Accounts", "Shared Services"],
  "Financial Management": ["Finance", "Treasury", "Corporate Services"],
  Software: ["Technology", "Product Engineering", "Digital Services"],
  Infrastructure: ["Information Technology", "Infrastructure", "Service Delivery"],
  "Data and Analytics": ["Data and Analytics", "Business Intelligence", "Strategy"],
  "HR Generalist": ["Human Resources", "People and Culture", "Corporate Services"],
  Recruitment: ["Talent Acquisition", "Human Resources", "People and Culture"],
  Production: ["Operations", "Manufacturing", "Production"],
  Teaching: ["Academics", "Teaching and Learning", "Student Services"],
  Clinical: ["Clinical Services", "Patient Care", "Medical Services"],
  Nursing: ["Nursing Services", "Patient Care", "Clinical Services"],
  "Civil Engineering": ["Engineering", "Projects", "Infrastructure"],
  "Site Management": ["Projects", "Construction", "Operations"],
  "Retail Banking": ["Retail Banking", "Branch Operations", "Customer Experience"],
  "Credit and Risk": ["Risk and Compliance", "Credit", "Finance"],
  Compliance: ["Risk and Compliance", "Legal", "Corporate Governance"],
  Programmes: ["Programmes", "Development", "Operations"],
  "Monitoring and Evaluation": ["Monitoring, Evaluation and Learning", "Programmes", "Strategy"],
};

export function departmentPlaceholderFor(family: string, industry: string) {
  const suggestions =
    DEPARTMENTS_BY_FAMILY[family] ??
    (industry
      ? [industry, "Operations", "Corporate Services"]
      : ["Operations", "Corporate Services", "Shared Services"]);
  return `e.g. ${suggestions.join(", ")}`;
}

export function responsibilitySentence(item: Responsibility) {
  if (item.duty?.trim()) return item.duty.trim();
  if (!item.action || !item.object) return "";
  return `${item.action} ${item.object}`;
}

/** Turns the structured builder into a formatted, human job description. */
export function generateJobDescription(builder: JobBuilder): string {
  const lines: string[] = [];
  const place = [builder.city, builder.region, builder.country].filter(Boolean).join(", ");

  lines.push("Position Summary");
  const summaryObjects = builder.responsibilities
    .slice(0, 3)
    .map((r) => r.object)
    .filter(Boolean);
  const summaryTail = summaryObjects.length
    ? ` The role is responsible for ${listSentence(summaryObjects)}.`
    : "";
  lines.push(
    `The ${builder.jobTitle || "successful candidate"} will be based in ${place || "our offices"} on a ${builder.employmentType.toLowerCase()} basis.${summaryTail}`,
  );

  if (builder.responsibilities.length) {
    lines.push("", "Key Responsibilities");
    for (const item of builder.responsibilities) {
      const sentence = responsibilitySentence(item);
      // O*NET task statements already end with a period — avoid "..".
      if (sentence) lines.push(`• ${sentence.replace(/\.+$/, "")}.`);
    }
  }

  lines.push("", "Minimum Requirements");
  if (builder.minQualification) {
    const fieldNames = builder.fieldsOfStudy.map((f) => typeof f === 'string' ? f : f.name);
    const fields = fieldNames.length
      ? ` in ${listSentence(fieldNames)} or a related field`
      : "";
    lines.push(
      `• ${builder.minQualification}${fields} is ${builder.qualificationLevel === "required" ? "required" : "preferred"}.`,
    );
  }
  if (builder.minExperience > 0 || builder.experienceAreas.length) {
    const areaNames = builder.experienceAreas.map((a) => typeof a === 'string' ? a : a.name);
    const areas = areaNames.length
      ? ` in ${listSentence(areaNames)}`
      : "";
    lines.push(`• Minimum of ${builder.minExperience} year(s) relevant experience${areas}.`);
  }
  const requiredCerts = builder.certifications.filter((c) => c.level !== "not_required");
  for (const cert of requiredCerts) {
    lines.push(
      `• ${cert.name} certification is ${cert.level === "required" ? "required" : "preferred"}.`,
    );
  }
  if (builder.licenseRequired && builder.licenseType) {
    lines.push(
      `• A valid ${builder.licenseType}${builder.licenseClass ? ` (class ${builder.licenseClass})` : ""} is required.`,
    );
  }

  const requiredSkills = builder.skills.filter((s) => s.level === "required").map((s) => s.name);
  const preferredSkills = builder.skills.filter((s) => s.level === "preferred").map((s) => s.name);
  if (requiredSkills.length || preferredSkills.length) {
    lines.push("", "Skills");
    if (requiredSkills.length) lines.push(`• Required: ${listSentence(requiredSkills)}.`);
    if (preferredSkills.length) lines.push(`• Preferred: ${listSentence(preferredSkills)}.`);
  }
  if (builder.software.length) {
    lines.push(
      `• Working knowledge of ${listSentence(builder.software.map((s) => `${s.name} (${s.proficiency.toLowerCase()})`))}.`,
    );
  }
  if (builder.languages.length) {
    lines.push(
      `• Language ability: ${listSentence(builder.languages.map((l) => `${l.name} (${l.level.toLowerCase()})`))}.`,
    );
  }

  const conditions: string[] = [];
  if (builder.travelRequired)
    conditions.push(`travel is required (${builder.travelFrequency.toLowerCase()})`);
  if (builder.relocationRequired) conditions.push("relocation may be required");
  if (builder.weekendWork) conditions.push("weekend work is required");
  if (builder.nightWork) conditions.push("night work is required");
  if (builder.physicalWork) conditions.push("the role involves physical work");
  if (builder.shiftRequired)
    conditions.push(`shift work is required (${builder.shiftType.toLowerCase()})`);
  if (conditions.length) {
    lines.push("", "Working Conditions");
    lines.push(`• ${capitalise(listSentence(conditions))}.`);
    if (builder.workingDays.length)
      lines.push(`• Working days: ${builder.workingDays.join(", ")}.`);
  }

  if (builder.showSalary && (builder.salaryMin || builder.salaryMax)) {
    lines.push("", "Remuneration");
    lines.push(
      `• ${builder.salaryType} salary of ${builder.salaryCurrency} ${formatNumber(builder.salaryMin)}${
        builder.salaryMax ? ` – ${formatNumber(builder.salaryMax)}` : ""
      }.`,
    );
  }

  return lines.join("\n");
}

function formatNumber(value: number | null) {
  return value === null ? "" : new Intl.NumberFormat("en-US").format(value);
}

export function listSentence(items: string[]) {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// --- Question generation ---------------------------------------------------

export const YEARS_OPTIONS: AnswerOption[] = [
  { label: "No experience", value: "none", points: 0 },
  { label: "Less than 1 year", value: "<1", points: 2 },
  { label: "1–2 years", value: "1-2", points: 5 },
  { label: "3–5 years", value: "3-5", points: 8 },
  { label: "More than 5 years", value: "5+", points: 10 },
];

export const PROFICIENCY_OPTIONS: AnswerOption[] = [
  { label: "None", value: "none", points: 0 },
  { label: "Basic", value: "basic", points: 3 },
  { label: "Intermediate", value: "intermediate", points: 6 },
  { label: "Advanced", value: "advanced", points: 9 },
  { label: "Expert", value: "expert", points: 10 },
];

export const RESPONSIBILITY_LEVEL_OPTIONS: AnswerOption[] = [
  { label: "No experience", value: "none", points: 0 },
  { label: "Assisted", value: "assisted", points: 4 },
  { label: "Performed independently", value: "independent", points: 7 },
  { label: "Supervised others", value: "supervised", points: 9 },
  { label: "Managed the function", value: "managed", points: 10 },
];

export function yesNoOptions(mandatoryYes: boolean): AnswerOption[] {
  return [
    { label: "Yes", value: "yes", points: 10 },
    { label: "No", value: "no", points: 0, disqualifying: mandatoryYes },
  ];
}

/**
 * Builds the candidate question set deterministically from the job structure.
 *
 * Years of experience and highest qualification are deliberately NOT asked as
 * screening questions: the applicant wizard already collects them structurally
 * (dated work history with field, education with qualification + field of
 * study) and the scoring engine grades them from that structured data. Asking
 * them again in screening was redundant.
 */
export function generateQuestions(builder: JobBuilder): BuilderQuestion[] {
  const questions: BuilderQuestion[] = [];

  for (const area of builder.experienceAreas.slice(0, 4)) {
    const areaName = typeof area === 'string' ? area : area.name;
    questions.push({
      key: `q_area_${slugKey(areaName)}`,
      category: "experience",
      text: `How would you describe your experience in ${areaName}?`,
      type: "single_choice",
      options: RESPONSIBILITY_LEVEL_OPTIONS,
      mandatory: false,
    });
  }

  for (const skill of builder.skills.filter((s) => s.level !== "not_required").slice(0, 8)) {
    questions.push({
      key: `q_skill_${slugKey(skill.name)}`,
      category: "skills",
      text: `How would you rate your ability in ${skill.name}?`,
      type: "single_choice",
      options: PROFICIENCY_OPTIONS,
      mandatory: false,
    });
  }

  for (const app of builder.software.slice(0, 6)) {
    questions.push({
      key: `q_software_${slugKey(app.name)}`,
      category: "skills",
      text: `What is your proficiency level in ${app.name}?`,
      type: "single_choice",
      options: PROFICIENCY_OPTIONS,
      mandatory: false,
    });
  }

  for (const cert of builder.certifications.filter((c) => c.level !== "not_required")) {
    questions.push({
      key: `q_cert_${slugKey(cert.name)}`,
      category: "certification",
      text: `Do you hold the ${cert.name} certification?`,
      type: "yes_no",
      options: yesNoOptions(cert.level === "required"),
      mandatory: cert.level === "required",
    });
  }

  if (builder.licenseRequired) {
    questions.push({
      key: "q_license",
      category: "license",
      text: `Do you hold a valid ${builder.licenseType || "license"}?`,
      type: "yes_no",
      options: yesNoOptions(true),
      mandatory: true,
    });
    questions.push({
      key: "q_license_years",
      category: "license",
      text: "How many years have you held this license?",
      type: "single_choice",
      options: YEARS_OPTIONS,
      mandatory: false,
      condition: { key: "q_license", equals: "yes" },
    });
  }

  for (const language of builder.languages) {
    questions.push({
      key: `q_lang_${slugKey(language.name)}`,
      category: "location",
      text: `What is your level of ${language.name}?`,
      type: "single_choice",
      options: LANGUAGE_LEVELS.map((level, index) => ({
        label: level,
        value: level.toLowerCase(),
        points: [3, 5, 8, 10][index] ?? 0,
      })),
      mandatory: false,
    });
  }

  if (builder.relocationRequired) {
    questions.push({
      key: "q_relocate",
      category: "availability",
      text: `Are you willing to relocate to ${builder.city || builder.region || builder.country}?`,
      type: "yes_no",
      options: yesNoOptions(true),
      mandatory: true,
    });
  }
  if (builder.travelRequired) {
    questions.push({
      key: "q_travel",
      category: "availability",
      text: "Are you available to travel as required by this role?",
      type: "yes_no",
      options: yesNoOptions(false),
      mandatory: false,
    });
  }
  if (builder.shiftRequired || builder.nightWork || builder.weekendWork) {
    questions.push({
      key: "q_shift",
      category: "availability",
      text: "Are you available to work shifts, nights or weekends as required?",
      type: "yes_no",
      options: yesNoOptions(false),
      mandatory: false,
    });
  }

  questions.push({
    key: "q_notice",
    category: "availability",
    text: "How soon can you start?",
    type: "single_choice",
    options: [
      { label: "Immediately", value: "immediately", points: 10 },
      { label: "Within 1 month", value: "1m", points: 8 },
      { label: "Within 2 months", value: "2m", points: 5 },
      { label: "More than 2 months", value: "3m+", points: 2 },
    ],
    mandatory: false,
  });

  return questions;
}

export function slugKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// --- Quality control -------------------------------------------------------

export type QualityIssue = { field: string; message: string };

export function checkCampaignQuality(builder: JobBuilder): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!builder.jobTitle) issues.push({ field: "jobTitle", message: "Select a job title." });
  if (!builder.minQualification)
    issues.push({ field: "minQualification", message: "Select a minimum qualification." });
  if (!builder.closingDate)
    issues.push({ field: "closingDate", message: "Set an application closing date." });
  if (builder.openingDate && builder.closingDate && builder.closingDate < builder.openingDate)
    issues.push({ field: "closingDate", message: "Closing date must be after the opening date." });
  if (!builder.responsibilities.some((r) => r.duty || (r.action && r.object)))
    issues.push({ field: "responsibilities", message: "Add at least one responsibility." });
  if (!builder.skills.some((s) => s.level === "required"))
    issues.push({ field: "skills", message: "Mark at least one skill as required." });
  const total = Object.values(builder.weights).reduce((sum, value) => sum + value, 0);
  if (total !== 100)
    issues.push({
      field: "weights",
      message: `Scoring weights total ${total}%, they must total 100%.`,
    });
  if (!builder.questions.length)
    issues.push({ field: "questions", message: "Generate at least one candidate question." });
  const mandatoryWithoutQuestion =
    builder.licenseRequired && !builder.questions.some((q) => q.key === "q_license");
  if (mandatoryWithoutQuestion)
    issues.push({ field: "questions", message: "Add a question covering the required license." });
  return issues;
}

export function billableDays(openingDate: string, closingDate: string) {
  if (!openingDate || !closingDate) return 0;
  const start = new Date(openingDate).getTime();
  const end = new Date(closingDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.max(1, Math.ceil((end - start) / 86_400_000) + 1);
}

export const DAILY_RATE_MWK = 15_000;

export function defaultBuilder(): JobBuilder {
  return {
    hiringReason: "New employee",
    industryId: null,
    industryName: "",
    jobFamilyId: null,
    jobFamilyName: "",
    jobFamilySource: null,
    jobTitleId: null,
    jobTitle: "",
    jobTitleSource: null,
    jobTitleExternalId: null,
    department: "",
    reportsTo: "",
    positions: 1,
    employmentType: "Permanent",
    country: "Malawi",
    region: "Central",
    city: "Lilongwe",
    workLocation: "Office",
    specificLocation: "",
    arrangement: "Full time",
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    shiftRequired: false,
    shiftType: "Day",
    minExperience: 2,
    maxExperience: null,
    experienceAreas: [],
    experienceLevel: "Mid-level",
    experienceRecencyYears: null,
    minQualification: "Diploma",
    fieldsOfStudy: [],
    qualificationLevel: "required",
    certifications: [],
    skills: [],
    software: [],
    licenseRequired: false,
    licenseType: "",
    licenseClass: "",
    languages: [{ name: "English", level: "Professional" }],
    travelRequired: false,
    travelFrequency: "None",
    relocationRequired: false,
    weekendWork: false,
    nightWork: false,
    physicalWork: false,
    driverRequired: false,
    showSalary: false,
    salaryType: "Monthly",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "MWK",
  responsibilities: [],
  openingDate: new Date().toISOString().slice(0, 10),
  closingDate: "",
  candidateLimit: null,
  allowLateApplications: false,
  allowEditAfterSubmit: false,
  sections: {
    personal: true,
    education: true,
    experience: true,
    skills: true,
    certifications: true,
    questions: true,
    documents: true,
    referees: true,
  },
  weights: { ...DEFAULT_WEIGHTS },
  questions: [],
  // Enhanced scoring fields
  highlyRelevantPositions: [],
  relatedPositions: [],
  industry: "",
  // v2 Requirement Groups
  requirementGroups: [],
  // Branding
  logoData: null,
  brandColor: "#2563eb",
  brandFont: "Inter",
  companyName: "",
};
}
