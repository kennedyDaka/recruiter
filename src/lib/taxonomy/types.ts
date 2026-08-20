/**
 * Taxonomy service — the single catalog abstraction for the ATS.
 *
 * The recruiter and applicant forms never hard-code catalog values: they ask
 * the taxonomy for suggestions and store only the picked entry (id + label).
 * Providers can be swapped without touching the forms:
 *
 *   - `esco` (default) — live ESCO (European Commission) as the single source
 *     of truth for occupations, skills and ISCO job families
 *   - `local` — the canonical DB catalogs, used only as an offline fallback
 *   - `hybrid` — ESCO first, DB on any failure (resilience, not duplication)
 *
 * ESCO's search API models occupations and skills only — qualifications and
 * fields of study have no ESCO equivalent and stay on the app's standards
 * layer (see QUALIFICATIONS in job-builder.ts and the fields_of_study table).
 * Set TAXONOMY_PROVIDER=esco|local|hybrid to choose.
 */

export type TaxonomySource = "local" | "esco" | "onet" | "manual";

export type TaxonomyEntry = {
  /** Local DB id, or the external taxonomy URI when the entry came from ESCO. */
  id: string;
  label: string;
  source: TaxonomySource;
  /** The canonical external reference (e.g. ESCO URI) when available. */
  externalId?: string;
  description?: string;
};

export type TaxonomyKind = "occupation" | "skill" | "field_of_study" | "job_family";

export interface TaxonomyProvider {
  readonly name: string;
  searchOccupations(query: string, limit?: number): Promise<TaxonomyEntry[]>;
  searchSkills(query: string, limit?: number): Promise<TaxonomyEntry[]>;
  searchFieldsOfStudy(query: string, limit?: number): Promise<TaxonomyEntry[]>;
  searchJobFamilies?(query: string, limit?: number): Promise<TaxonomyEntry[]>;
}
