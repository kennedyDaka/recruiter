/**
 * ORS Normalization Layer — classifies candidate raw answers using
 * ISCO/O*NET/ESCO taxonomy data. This is the bridge between what the
 * candidate reports and what the scoring engine understands.
 *
 * The candidate says: "Fleet Manager"
 * The normalization layer maps it to: ISCO 1324 "Transport services manager"
 * The scoring engine then evaluates: "Is this related to the target occupation?"
 *
 * This layer handles:
 * - Position title → ISCO occupation classification
 * - Field of study → Education field classification
 * - Skills → Skill taxonomy matching
 * - Industry → Industry classification
 */

// ─── Types ──────────────────────────────────────────────────────────

export type NormalizedOccupation = {
  /** Original title the candidate provided */
  original: string;
  /** Normalized ISCO code (e.g., "1324") */
  iscoCode?: string;
  /** ISCO title */
  iscoTitle?: string;
  /** ISCO job family */
  jobFamily?: string;
  /** ISCO job group */
  jobGroup?: string;
  /** O*NET SOC code if available */
  onetCode?: string;
  /** O*NET title */
  onetTitle?: string;
  /** ESCO URI if available */
  escoUri?: string;
  /** ESCO title */
  escoTitle?: string;
  /** Relevance score to the target occupation (0-1) */
  relevanceToTarget?: number;
  /** Classification confidence (0-1) */
  confidence: number;
};

export type NormalizedField = {
  /** Original field the candidate provided */
  original: string;
  /** Normalized field category */
  category: string;
  /** Related ISCO skill groups */
  relatedSkills: string[];
  /** Confidence */
  confidence: number;
};

export type NormalizedSkill = {
  /** Original skill the candidate provided */
  original: string;
  /** Normalized skill name */
  normalized: string;
  /** Skill category */
  category: string;
  /** O*NET skill ID if available */
  onetSkillId?: string;
  /** Related skills */
  relatedSkills: string[];
  /** Confidence */
  confidence: number;
};

export type NormalizedIndustry = {
  /** Original industry the candidate provided */
  original: string;
  /** Normalized industry name */
  normalized: string;
  /** ISCO industry group */
  industryGroup: string;
  /** Confidence */
  confidence: number;
};

// ─── Position Classification ────────────────────────────────────────

/**
 * Common position title mappings to ISCO codes.
 * Used when external APIs are not available.
 */
const POSITION_MAPPINGS: Record<string, { isco: string; title: string; family: string; group: string }> = {
  // Fleet & Transport
  "fleet manager": { isco: "1324", title: "Transport services manager", family: "Transport services managers", group: "Managers" },
  "fleet supervisor": { isco: "1324", title: "Transport services manager", family: "Transport services managers", group: "Managers" },
  "fleet coordinator": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "transport manager": { isco: "1324", title: "Transport services manager", family: "Transport services managers", group: "Managers" },
  "transport coordinator": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "transport officer": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "logistics manager": { isco: "1324", title: "Transport services manager", family: "Transport services managers", group: "Managers" },
  "logistics officer": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "logistics coordinator": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "depot manager": { isco: "1324", title: "Transport services manager", family: "Transport services managers", group: "Managers" },
  "depot officer": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "operations manager": { isco: "1120", title: "Managing directors and chief executives", family: "General managers", group: "Managers" },
  "operations officer": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "warehouse manager": { isco: "1324", title: "Transport services manager", family: "Transport services managers", group: "Managers" },
  "warehouse supervisor": { isco: "6130", title: "Manufacturing and industrial managers", family: "Manufacturing managers", group: "Skilled agricultural, forestry and fishery workers" },

  // Healthcare
  "nurse": { isco: "2221", title: "Nursing professionals", family: "Nursing professionals", group: "Health professionals" },
  "registered nurse": { isco: "2221", title: "Nursing professionals", family: "Nursing professionals", group: "Health professionals" },
  "clinical officer": { isco: "2222", title: "Medical practitioners", family: "Medical practitioners", group: "Health professionals" },
  "doctor": { isco: "2222", title: "Medical practitioners", family: "Medical practitioners", group: "Health professionals" },
  "pharmacist": { isco: "2221", title: "Pharmacists", family: "Pharmacists", group: "Health professionals" },
  "physiotherapist": { isco: "2223", title: "Physiotherapists", family: "Physiotherapists", group: "Health professionals" },
  "medical officer": { isco: "2222", title: "Medical practitioners", family: "Medical practitioners", group: "Health professionals" },
  "health surveillance officer": { isco: "2264", title: "Environmental and occupational health inspectors", family: "Environmental health inspectors", group: "Health professionals" },

  // IT
  "software developer": { isco: "2512", title: "Software developers", family: "Software developers", group: "ICT professionals" },
  "software engineer": { isco: "2512", title: "Software developers", family: "Software developers", group: "ICT professionals" },
  "data analyst": { isco: "2511", title: "Systems analysts", family: "Systems analysts", group: "ICT professionals" },
  "it manager": { isco: "1330", title: "ICT managers", family: "ICT managers", group: "Managers" },
  "network administrator": { isco: "2522", title: "Network and systems administrators", family: "Network administrators", group: "ICT professionals" },

  // Finance
  "accountant": { isco: "2411", title: "Accountants", family: "Accountants", group: "Business and administration professionals" },
  "financial manager": { isco: "1112", title: "Financial managers", family: "Financial managers", group: "Managers" },
  "finance manager": { isco: "1112", title: "Financial managers", family: "Financial managers", group: "Managers" },
  "auditor": { isco: "2411", title: "Accountants", family: "Accountants", group: "Business and administration professionals" },

  // HR
  "human resources manager": { isco: "1213", title: "Personnel managers", family: "Personnel managers", group: "Managers" },
  "hr manager": { isco: "1213", title: "Personnel managers", family: "Personnel managers", group: "Managers" },
  "recruitment officer": { isco: "2230", title: "Social work and counselling professionals", family: "Social workers", group: "Social services professionals" },

  // Sales & Marketing
  "sales manager": { isco: "1221", title: "Sales, marketing and development managers", family: "Sales managers", group: "Managers" },
  "marketing manager": { isco: "1221", title: "Sales, marketing and development managers", family: "Marketing managers", group: "Managers" },
  "sales representative": { isco: "5223", title: "Shop sales assistants", family: "Sales assistants", group: "Services and sales workers" },

  // Education
  "teacher": { isco: "2342", title: "Secondary education teachers", family: "Secondary school teachers", group: "Teaching professionals" },
  "lecturer": { isco: "2310", title: "University teachers", family: "University teachers", group: "Teaching professionals" },
  "principal": { isco: "1342", title: "Primary and secondary school principals", family: "School principals", group: "Managers" },

  // Engineering
  "civil engineer": { isco: "2142", title: "Civil engineers", family: "Civil engineers", group: "Engineering professionals" },
  "mechanical engineer": { isco: "2141", title: "Mechanical engineers", family: "Mechanical engineers", group: "Engineering professionals" },
  "electrical engineer": { isco: "2151", title: "Electrical engineers", family: "Electrical engineers", group: "Engineering professionals" },

  // General
  "manager": { isco: "1120", title: "Managing directors and chief executives", family: "General managers", group: "Managers" },
  "supervisor": { isco: "6130", title: "Manufacturing and industrial managers", family: "Manufacturing managers", group: "Skilled workers" },
  "officer": { isco: "3322", title: "Clerical support workers", family: "Clerical support workers", group: "Clerical support workers" },
  "coordinator": { isco: "3322", title: "Transport clerk", family: "Transport clerks", group: "Clerical support workers" },
  "director": { isco: "1120", title: "Managing directors and chief executives", family: "General managers", group: "Managers" },
  "executive": { isco: "1120", title: "Managing directors and chief executives", family: "General managers", group: "Managers" },
};

/**
 * Normalize a position title to ISCO classification.
 * Uses local mappings first, then falls back to term similarity.
 */
export function normalizeOccupation(
  title: string,
  targetOccupation?: string,
): NormalizedOccupation {
  const lower = title.trim().toLowerCase();

  // Check exact match in local mappings
  const mapping = POSITION_MAPPINGS[lower];
  if (mapping) {
    const result: NormalizedOccupation = {
      original: title,
      iscoCode: mapping.isco,
      iscoTitle: mapping.title,
      jobFamily: mapping.family,
      jobGroup: mapping.group,
      confidence: 0.9,
    };

    // Calculate relevance to target if provided
    if (targetOccupation) {
      result.relevanceToTarget = calculateOccupationRelevance(title, targetOccupation);
    }

    return result;
  }

  // Check for partial match (e.g., "Senior Fleet Manager" matches "fleet manager")
  for (const [key, mapping] of Object.entries(POSITION_MAPPINGS)) {
    if (lower.includes(key) || key.includes(lower)) {
      const result: NormalizedOccupation = {
        original: title,
        iscoCode: mapping.isco,
        iscoTitle: mapping.title,
        jobFamily: mapping.family,
        jobGroup: mapping.group,
        confidence: 0.7,
      };

      if (targetOccupation) {
        result.relevanceToTarget = calculateOccupationRelevance(title, targetOccupation);
      }

      return result;
    }
  }

  // No match found — return low confidence
  return {
    original: title,
    confidence: 0.2,
  };
}

/**
 * Calculate relevance between two occupation titles (0-1).
 */
function calculateOccupationRelevance(a: string, b: string): number {
  const termsA = normaliseTerms(a);
  const termsB = normaliseTerms(b);
  if (!termsA.length || !termsB.length) return 0;

  const setB = new Set(termsB);
  const overlap = termsA.filter((t) => setB.has(t)).length;
  return overlap / Math.max(termsA.length, termsB.length);
}

// ─── Field of Study Classification ──────────────────────────────────

const FIELD_CATEGORIES: Record<string, { category: string; relatedSkills: string[] }> = {
  "logistics": { category: "Logistics & Supply Chain", relatedSkills: ["Supply Chain Management", "Logistics Planning", "Inventory Management"] },
  "supply chain": { category: "Logistics & Supply Chain", relatedSkills: ["Supply Chain Management", "Procurement", "Warehouse Management"] },
  "transport": { category: "Transport & Distribution", relatedSkills: ["Fleet Management", "Route Planning", "Transport Operations"] },
  "business administration": { category: "Business & Management", relatedSkills: ["Project Management", "Leadership", "Strategic Planning"] },
  "commerce": { category: "Business & Commerce", relatedSkills: ["Accounting", "Finance", "Business Development"] },
  "accounting": { category: "Finance & Accounting", relatedSkills: ["Financial Reporting", "Budget Management", "Auditing"] },
  "finance": { category: "Finance & Accounting", relatedSkills: ["Financial Analysis", "Investment Management", "Risk Assessment"] },
  "marketing": { category: "Marketing & Sales", relatedSkills: ["Digital Marketing", "Brand Management", "Market Research"] },
  "computer science": { category: "Information Technology", relatedSkills: ["Software Development", "Data Analysis", "Systems Design"] },
  "information technology": { category: "Information Technology", relatedSkills: ["Network Administration", "Database Management", "IT Support"] },
  "engineering": { category: "Engineering", relatedSkills: ["Project Management", "Technical Design", "Quality Control"] },
  "nursing": { category: "Healthcare", relatedSkills: ["Patient Care", "Clinical Skills", "Health Education"] },
  "medicine": { category: "Healthcare", relatedSkills: ["Clinical Diagnosis", "Patient Management", "Medical Research"] },
  "law": { category: "Legal", relatedSkills: ["Legal Research", "Contract Drafting", "Compliance"] },
  "education": { category: "Education", relatedSkills: ["Curriculum Development", "Classroom Management", "Student Assessment"] },
  "agriculture": { category: "Agriculture", relatedSkills: ["Crop Management", "Livestock Management", "Agricultural Economics"] },
  "hospitality": { category: "Hospitality & Tourism", relatedSkills: ["Event Management", "Customer Service", "Food Safety"] },
  "mining": { category: "Mining & Resources", relatedSkills: ["Mine Safety", "Geological Survey", "Resource Extraction"] },
  "environmental science": { category: "Environmental", relatedSkills: ["Environmental Impact Assessment", "Sustainability", "Waste Management"] },
  "public administration": { category: "Government & Public Sector", relatedSkills: ["Policy Analysis", "Public Finance", "Governance"] },
};

/**
 * Normalize a field of study to a category.
 */
export function normalizeField(field: string): NormalizedField {
  const lower = field.trim().toLowerCase();

  // Check exact match
  for (const [key, config] of Object.entries(FIELD_CATEGORIES)) {
    if (lower.includes(key) || key.includes(lower)) {
      return {
        original: field,
        category: config.category,
        relatedSkills: config.relatedSkills,
        confidence: 0.85,
      };
    }
  }

  // Check term overlap
  const fieldTerms = normaliseTerms(field);
  let bestMatch = 0;
  let bestCategory = "General";
  let bestSkills: string[] = [];

  for (const [key, config] of Object.entries(FIELD_CATEGORIES)) {
    const keyTerms = normaliseTerms(key);
    const overlap = fieldTerms.filter((t) => keyTerms.includes(t)).length;
    const matchRatio = overlap / Math.max(fieldTerms.length, 1);
    if (matchRatio > bestMatch) {
      bestMatch = matchRatio;
      bestCategory = config.category;
      bestSkills = config.relatedSkills;
    }
  }

  if (bestMatch >= 0.5) {
    return {
      original: field,
      category: bestCategory,
      relatedSkills: bestSkills,
      confidence: 0.6,
    };
  }

  return {
    original: field,
    category: "General",
    relatedSkills: [],
    confidence: 0.3,
  };
}

// ─── Skill Classification ───────────────────────────────────────────

const SKILL_CATEGORIES: Record<string, { category: string; related: string[] }> = {
  "fleet management": { category: "Transport & Logistics", related: ["Vehicle Tracking", "Route Planning", "Fleet Maintenance"] },
  "vehicle tracking": { category: "Transport & Logistics", related: ["GPS Systems", "Telematics", "Fleet Management"] },
  "route planning": { category: "Transport & Logistics", related: ["Fleet Management", "GPS Systems", "Logistics Planning"] },
  "fuel management": { category: "Transport & Logistics", related: ["Fleet Management", "Cost Control", "Vehicle Maintenance"] },
  "driver management": { category: "Transport & Logistics", related: ["Fleet Management", "Human Resources", "Compliance"] },
  "supply chain management": { category: "Logistics & Supply Chain", related: ["Procurement", "Inventory Management", "Warehouse Management"] },
  "microsoft excel": { category: "IT & Software", related: ["Data Analysis", "Spreadsheet Management", "Microsoft Office"] },
  "microsoft office": { category: "IT & Software", related: ["Word Processing", "Presentation Skills", "Email Management"] },
  "project management": { category: "Management & Leadership", related: ["Planning", "Risk Management", "Stakeholder Management"] },
  "leadership": { category: "Management & Leadership", related: ["Team Management", "Decision Making", "Communication"] },
  "communication": { category: "Soft Skills", related: ["Presentation Skills", "Negotiation", "Customer Service"] },
  "customer service": { category: "Soft Skills", related: ["Communication", "Problem Solving", "Conflict Resolution"] },
  "problem solving": { category: "Soft Skills", related: ["Critical Thinking", "Decision Making", "Analytical Skills"] },
  "accounting": { category: "Finance & Accounting", related: ["Financial Reporting", "Budget Management", "Microsoft Excel"] },
  "financial analysis": { category: "Finance & Accounting", related: ["Accounting", "Budget Management", "Data Analysis"] },
  "human resources": { category: "HR & People", related: ["Recruitment", "Employee Relations", "Performance Management"] },
  "recruitment": { category: "HR & People", related: ["Interviewing", "Talent Acquisition", "Onboarding"] },
  "quality control": { category: "Quality & Compliance", related: ["Quality Assurance", "Auditing", "Process Improvement"] },
  "safety management": { category: "Health & Safety", related: ["Risk Assessment", "Compliance", "Emergency Response"] },
  "compliance": { category: "Legal & Regulatory", related: ["Regulatory Knowledge", "Auditing", "Risk Management"] },
  "data analysis": { category: "IT & Software", related: ["Microsoft Excel", "SQL", "Data Visualization"] },
  "sql": { category: "IT & Software", related: ["Database Management", "Data Analysis", "Reporting"] },
  "python": { category: "IT & Software", related: ["Programming", "Data Analysis", "Automation"] },
  "javascript": { category: "IT & Software", related: ["Web Development", "Programming", "Frontend Development"] },
  "power bi": { category: "IT & Software", related: ["Data Visualization", "Business Intelligence", "Data Analysis"] },
  "erp": { category: "IT & Software", related: ["Enterprise Resource Planning", "Business Systems", "Data Management"] },
  "gps systems": { category: "Transport & Logistics", related: ["Vehicle Tracking", "Route Planning", "Fleet Management"] },
  "telematics": { category: "Transport & Logistics", related: ["Vehicle Tracking", "Fleet Management", "Data Analysis"] },
  "first aid": { category: "Health & Safety", related: ["Emergency Response", "Patient Care", "Safety Management"] },
};

/**
 * Normalize a skill name.
 */
export function normalizeSkill(skill: string): NormalizedSkill {
  const lower = skill.trim().toLowerCase();

  // Check exact match
  for (const [key, config] of Object.entries(SKILL_CATEGORIES)) {
    if (lower === key || lower.includes(key) || key.includes(lower)) {
      return {
        original: skill,
        normalized: key,
        category: config.category,
        relatedSkills: config.related,
        confidence: 0.85,
      };
    }
  }

  // Check term overlap
  const skillTerms = normaliseTerms(skill);
  let bestMatch = 0;
  let bestCategory = "General";
  let bestRelated: string[] = [];

  for (const [key, config] of Object.entries(SKILL_CATEGORIES)) {
    const keyTerms = normaliseTerms(key);
    const overlap = skillTerms.filter((t) => keyTerms.includes(t)).length;
    const matchRatio = overlap / Math.max(skillTerms.length, 1);
    if (matchRatio > bestMatch) {
      bestMatch = matchRatio;
      bestCategory = config.category;
      bestRelated = config.related;
    }
  }

  if (bestMatch >= 0.5) {
    return {
      original: skill,
      normalized: skill.trim().toLowerCase(),
      category: bestCategory,
      relatedSkills: bestRelated,
      confidence: 0.6,
    };
  }

  return {
    original: skill,
    normalized: skill.trim().toLowerCase(),
    category: "General",
    relatedSkills: [],
    confidence: 0.3,
  };
}

// ─── Industry Classification ────────────────────────────────────────

const INDUSTRY_MAPPINGS: Record<string, string> = {
  "logistics": "Logistics & Supply Chain",
  "transport": "Transport & Distribution",
  "fleet": "Transport & Fleet",
  "automotive": "Automotive",
  "aviation": "Aviation & Aerospace",
  "shipping": "Maritime & Shipping",
  "manufacturing": "Manufacturing",
  "construction": "Construction",
  "mining": "Mining & Resources",
  "agriculture": "Agriculture & Food",
  "healthcare": "Healthcare",
  "hospitality": "Hospitality & Tourism",
  "retail": "Retail & Consumer",
  "wholesale": "Wholesale & Distribution",
  "fmcg": "Fast-Moving Consumer Goods",
  "banking": "Banking & Financial Services",
  "insurance": "Insurance",
  "telecommunications": "Telecommunications",
  "energy": "Energy & Utilities",
  "education": "Education",
  "government": "Government & Public Sector",
  "nonprofit": "Non-Profit & NGO",
  "technology": "Technology & IT",
  "media": "Media & Entertainment",
  "real estate": "Real Estate",
  "legal": "Legal Services",
  "consulting": "Consulting & Professional Services",
};

/**
 * Normalize an industry name.
 */
export function normalizeIndustry(industry: string): NormalizedIndustry {
  const lower = industry.trim().toLowerCase();

  for (const [key, normalized] of Object.entries(INDUSTRY_MAPPINGS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return {
        original: industry,
        normalized,
        industryGroup: normalized,
        confidence: 0.85,
      };
    }
  }

  return {
    original: industry,
    normalized: industry,
    industryGroup: "Other",
    confidence: 0.3,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function normaliseTerms(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["and", "the", "for", "with", "of", "in", "a", "an"].includes(t));
}

/**
 * Full normalization of a candidate's input.
 * Returns normalized versions of all fields for the scoring engine.
 */
export function normalizeCandidateInput(input: {
  positionTitle?: string;
  fieldOfStudy?: string;
  skills?: string[];
  industry?: string;
  targetOccupation?: string;
}): {
  occupation: NormalizedOccupation;
  field: NormalizedField;
  skills: NormalizedSkill[];
  industry: NormalizedIndustry;
} {
  return {
    occupation: input.positionTitle
      ? normalizeOccupation(input.positionTitle, input.targetOccupation)
      : { original: "", confidence: 0 },
    field: input.fieldOfStudy
      ? normalizeField(input.fieldOfStudy)
      : { original: "", category: "General", relatedSkills: [], confidence: 0 },
    skills: (input.skills || []).map(normalizeSkill),
    industry: input.industry
      ? normalizeIndustry(input.industry)
      : { original: "", normalized: "", industryGroup: "Other", confidence: 0 },
  };
}
