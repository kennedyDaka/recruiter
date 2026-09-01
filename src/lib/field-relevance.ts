/**
 * Field-of-study and industry relevance taxonomy.
 *
 * Used by the scoring engine to determine whether a candidate's education
 * and experience fields are relevant to the vacancy requirements. This is
 * a presentation/data layer — scoring logic lives in ors-scoring-v2.ts.
 *
 * Architecture:
 *   recruiter defines required fields
 *         ↓
 *   taxonomy checks if candidate field is in the same cluster
 *         ↓
 *   relevance level: exact | very_related | related | weakly_related | unrelated
 */

// ── Field Clusters ───────────────────────────────────────────────────

/** Each cluster groups fields that are considered related for matching. */
const FIELD_CLUSTERS: string[][] = [
  // Agriculture & Environment
  ["agriculture", "agricultural science", "farming", "crop production", "horticulture",
    "agronomy", "animal science", "farm management", "agricultural engineering",
    "agricultural economics", "food science", "forestry", "environmental science",
    "veterinary", "livestock", "irrigation", "soil science", "plant science"],

  // Business & Finance
  ["business administration", "business management", "accounting", "finance",
    "economics", "banking", "financial management", "commerce", "marketing",
    "business studies", "entrepreneurship", "international business",
    "project management", "public administration", "human resource management",
    "procurement", "supply chain management", "logistics", "operations management"],

  // Engineering & Technology
  ["engineering", "civil engineering", "mechanical engineering", "electrical engineering",
    "chemical engineering", "computer engineering", "software engineering",
    "information technology", "computer science", "data science", "electronics",
    "telecommunications", "mining engineering", "metallurgy", "industrial engineering",
    "biomedical engineering", "environmental engineering", "architecture"],

  // Health & Medicine
  ["medicine", "nursing", "pharmacy", "public health", "dentistry",
    "clinical medicine", "community health", "health sciences", "midwifery",
    "nutrition", "physiotherapy", "laboratory sciences", "radiography",
    "optometry", "medical laboratory", "health administration",
    "specialist nursing", "mental health", "emergency medicine"],

  // Education & Social Sciences
  ["education", "teaching", "early childhood education", "special education",
    "educational management", "psychology", "social work", "sociology",
    "anthropology", "political science", "international relations",
    "development studies", "gender studies", "public policy", "law",
    "legal studies", "criminology", "theology", "philosophy"],

  // Natural Sciences
  ["physics", "chemistry", "biology", "mathematics", "statistics",
    "biotechnology", "microbiology", "geology", "geography",
    "marine science", "astronomy", "actuarial science"],

  // Arts & Creative
  ["fine art", "graphic design", "media studies", "journalism",
    "communication studies", "film studies", "photography", "music",
    "performing arts", "fashion design", "interior design", "web design",
    "animation", "creative writing", "languages", "linguistics",
    "translation", "literature", "history"],

  // Transport & Logistics
  ["transport", "logistics", "supply chain", "fleet management",
    "maritime studies", "aviation", "warehouse management", "distribution",
    "procurement and logistics", "freight management"],

  // Hospitality & Tourism
  ["hospitality", "tourism", "hotel management", "culinary arts",
    "food and beverage", "event management", "travel management"],
];

// ── Normalisation ────────────────────────────────────────────────────

function normaliseField(field: string): string {
  return field.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

/**
 * Find which cluster a field belongs to, if any.
 * Returns the cluster index or -1 if not found.
 */
function fieldClusterIndex(field: string): number {
  const norm = normaliseField(field);
  for (let i = 0; i < FIELD_CLUSTERS.length; i++) {
    const cluster = FIELD_CLUSTERS[i];
    if (!cluster) continue;
    for (const member of cluster) {
      if (norm.includes(normaliseField(member)) || normaliseField(member).includes(norm)) {
        return i;
      }
    }
  }
  return -1;
}

// ── Relevance Classification ─────────────────────────────────────────

export type FieldRelevance = "exact" | "very_related" | "related" | "weakly_related" | "unrelated" | "unknown";

export interface FieldRelevanceResult {
  relevance: FieldRelevance;
  score: number; // 0-1
  explanation: string;
}

/**
 * Classify how relevant a candidate's field of study is to the required fields.
 *
 * @param candidateField - The candidate's field of study
 * @param requiredFields - The recruiter's required/relevant fields
 * @returns Relevance classification with score and explanation
 */
export function classifyFieldRelevance(
  candidateField: string,
  requiredFields: string[],
): FieldRelevanceResult {
  if (!candidateField || !candidateField.trim()) {
    return { relevance: "unknown", score: 0.5, explanation: "No field of study provided" };
  }
  if (!requiredFields.length) {
    return { relevance: "unknown", score: 0.5, explanation: "No required fields configured" };
  }

  const normCandidate = normaliseField(candidateField);

  // 1. Check exact match against required fields
  for (const req of requiredFields) {
    if (normCandidate === normaliseField(req)) {
      return { relevance: "exact", score: 1.0, explanation: `Exact match: ${candidateField}` };
    }
  }

  // 2. Check substring containment (e.g. "Agricultural Science" contains "Agriculture")
  for (const req of requiredFields) {
    const normReq = normaliseField(req);
    if (normCandidate.includes(normReq) || normReq.includes(normCandidate)) {
      return { relevance: "very_related", score: 0.9, explanation: `Directly related: ${candidateField} ↔ ${req}` };
    }
  }

  // 3. Check cluster membership (e.g. "Agronomy" is in the same cluster as "Agriculture")
  const candidateCluster = fieldClusterIndex(candidateField);
  if (candidateCluster >= 0) {
    for (const req of requiredFields) {
      const reqCluster = fieldClusterIndex(req);
      if (reqCluster === candidateCluster) {
        return { relevance: "related", score: 0.7, explanation: `Related field: ${candidateField} is in the same discipline as ${req}` };
      }
    }
  }

  // 4. Check word overlap (e.g. "Farm Management" shares "farm" with "Farming")
  const candidateWords = new Set(normCandidate.split(/\s+/));
  for (const req of requiredFields) {
    const reqWords = new Set(normaliseField(req).split(/\s+/));
    const overlap = [...candidateWords].filter((w) => reqWords.has(w) && w.length > 3);
    if (overlap.length > 0) {
      return { relevance: "weakly_related", score: 0.4, explanation: `Partially related: shares terms (${overlap.join(", ")}) with ${req}` };
    }
  }

  // 5. No connection found
  return { relevance: "unrelated", score: 0, explanation: `${candidateField} is not related to any required field` };
}

/**
 * Classify overall education relevance when multiple education entries exist.
 * Returns the best relevance across all entries.
 */
export function classifyEducationRelevance(
  educationFields: string[],
  requiredFields: string[],
): FieldRelevanceResult {
  if (!educationFields.length || !requiredFields.length) {
    return { relevance: "unknown", score: 0.5, explanation: "Insufficient data for education relevance" };
  }

  let best: FieldRelevanceResult = { relevance: "unrelated", score: 0, explanation: "" };

  for (const field of educationFields) {
    const result = classifyFieldRelevance(field, requiredFields);
    if (result.score > best.score) {
      best = result;
    }
  }

  return best;
}

/**
 * Check if a field name matches any of the accepted experience areas.
 * Returns the best match ratio.
 */
export function matchExperienceArea(
  entryField: string,
  entryTitle: string,
  acceptedAreas: string[],
): { ratio: number; relevance: "exact" | "related" | "unrelated" } {
  if (!acceptedAreas.length) {
    return { ratio: 1, relevance: "exact" }; // No areas specified — everything counts
  }

  const combined = `${entryField} ${entryTitle}`.trim().toLowerCase();

  for (const area of acceptedAreas) {
    const normArea = normaliseField(area);

    // Exact containment
    if (combined.includes(normArea) || normArea.includes(combined)) {
      return { ratio: 1, relevance: "exact" };
    }

    // Word overlap
    const areaWords = new Set(normArea.split(/\s+/));
    const combinedWords = new Set(combined.split(/\s+/));
    const overlap = [...combinedWords].filter((w) => areaWords.has(w) && w.length > 3);
    if (overlap.length > 0) {
      return { ratio: 0.7, relevance: "related" };
    }

    // Cluster check
    const areaCluster = fieldClusterIndex(area);
    const fieldCluster = fieldClusterIndex(entryField);
    if (areaCluster >= 0 && fieldCluster >= 0 && areaCluster === fieldCluster) {
      return { ratio: 0.5, relevance: "related" };
    }
  }

  return { ratio: 0, relevance: "unrelated" };
}
