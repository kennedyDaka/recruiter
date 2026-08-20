import type { TaxonomyEntry, TaxonomyProvider } from "./types";

const ESCO_BASE = "https://ec.europa.eu/esco/api";

type EscoResult = {
  _embedded?: {
    results?: {
      uri?: string;
      title?: string;
      description?: { en?: string } | string;
    }[];
  };
};

type OccupationResource = {
  title?: string;
  uri?: string;
  code?: string;
  _links?: {
    broaderIscoGroup?: { uri?: string; title?: string; code?: string }[];
    hasEssentialSkill?: { uri?: string; title?: string }[];
    hasOptionalSkill?: { uri?: string; title?: string }[];
  };
  _embedded?: {
    ancestors?: { title?: string; uri?: string; _links?: { self?: { href?: string } } }[];
  };
};

export type EscoOccupationDetail = {
  id: string;
  label: string;
  /** ISCO group (the job family), e.g. "Software developers". */
  family: { id: string; label: string; code?: string } | null;
  /** Ancestor chain, narrowest first: family → group → domain → major group. */
  ancestors: { id: string; label: string }[];
  /** Essential skills/competences — doubles as the role's duties. */
  essentialSkills: string[];
  optionalSkills: string[];
};

async function escoSearch(
  kind: "occupation" | "skill",
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<TaxonomyEntry[]> {
  const url = new URL(`${ESCO_BASE}/search`);
  url.searchParams.set("language", "en");
  url.searchParams.set("text", query);
  url.searchParams.set("type", kind);
  url.searchParams.set("limit", String(Math.min(limit, 20)));
  url.searchParams.set("offset", "0");
  url.searchParams.set("full", "false");

  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`ESCO returned ${response.status}`);
  const payload = (await response.json()) as EscoResult;
  const results = payload._embedded?.results ?? [];
  const entries: TaxonomyEntry[] = [];
  for (const item of results) {
    if (!item.title) continue;
    const description =
      typeof item.description === "string"
        ? item.description
        : typeof item.description === "object" &&
            item.description !== null &&
            "en" in item.description &&
            typeof item.description.en === "string"
          ? item.description.en
          : "";
    const entry: TaxonomyEntry = {
      id: item.uri ?? item.title,
      label: item.title,
      source: "esco",
    };
    if (item.uri) entry.externalId = item.uri;
    if (description) entry.description = description;
    entries.push(entry);
    if (entries.length >= limit) break;
  }
  return entries;
}

/** Fetches a single occupation resource and returns its skills + ISCO family. */
async function escoOccupationDetail(uri: string, signal: AbortSignal): Promise<OccupationResource> {
  const url = new URL(`${ESCO_BASE}/resource/occupation`);
  url.searchParams.set("uri", uri);
  url.searchParams.set("language", "en");
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`ESCO occupation detail returned ${response.status}`);
  return (await response.json()) as OccupationResource;
}

/**
 * Live ESCO (European Commission) provider — the single source of truth for
 * occupations, skills and ISCO job families. ESCO is free, multilingual and
 * designed for labour-market job matching, which suits markets like Malawi
 * where local titles map onto international occupations. Its search API only
 * models occupations and skills — qualifications and fields of study have no
 * ESCO equivalent, so those stay on the app's standards layer.
 */
export class EscoProvider implements TaxonomyProvider {
  readonly name = "esco";

  async searchOccupations(query: string, limit = 8) {
    return withTimeout((signal) => escoSearch("occupation", query, limit, signal));
  }

  async searchSkills(query: string, limit = 8) {
    return withTimeout((signal) => escoSearch("skill", query, limit, signal));
  }

  async searchFieldsOfStudy(_query: string, _limit = 8) {
    // ESCO does not model fields of study.
    return [];
  }

  /**
   * Job families are ESCO's ISCO occupation groups. We search occupations and
   * resolve each hit's broader ISCO group, deduped by group id.
   */
  async searchJobFamilies(query: string, limit = 8): Promise<TaxonomyEntry[]> {
    return withTimeout(async (signal) => {
      const hits = await escoSearch("occupation", query, Math.min(limit, 6), signal);
      // Resolve every hit's broader ISCO group in parallel — sequential
      // detail fetches made the family search crawl (~12s), which pushed it
      // against the timeout and surfaced as false "No matches found".
      const details = await Promise.allSettled(
        hits.filter((h) => h.externalId).map((h) => escoOccupationDetail(h.externalId!, signal)),
      );
      const seen = new Map<string, TaxonomyEntry>();
      const entries: TaxonomyEntry[] = [];
      for (const d of details) {
        if (d.status !== "fulfilled") continue;
        const group = d.value._links?.broaderIscoGroup?.[0];
        if (!group?.title || !group.uri) continue;
        if (seen.has(group.uri)) continue;
        const entry: TaxonomyEntry = {
          id: group.uri,
          label: group.title,
          source: "esco",
          externalId: group.uri,
        };
        if (group.code) entry.description = `ISCO group ${group.code}`;
        seen.set(group.uri, entry);
        entries.push(entry);
        if (entries.length >= limit) break;
      }
      return entries;
    });
  }

  /** Full detail for one occupation: duties (skills), family and hierarchy. */
  async getOccupation(uri: string): Promise<EscoOccupationDetail | null> {
    return withTimeout(async (signal) => {
      try {
        const detail = await escoOccupationDetail(uri, signal);
        const label = detail.title ?? uri;
        const familyLink = detail._links?.broaderIscoGroup?.[0];
        const ancestors = (detail._embedded?.ancestors ?? []).map((ancestor) => ({
          id: ancestor.uri ?? ancestor.title ?? "",
          label: ancestor.title ?? "",
        }));
        const family: EscoOccupationDetail["family"] = familyLink?.title
          ? {
              id: familyLink.uri ?? familyLink.title,
              label: familyLink.title,
            }
          : null;
        if (family && familyLink?.code) family.code = familyLink.code;
        return {
          id: uri,
          label,
          family,
          // Skip self (index 0) — ancestors come narrowest-first.
          ancestors: ancestors.slice(1).filter((a) => a.label),
          essentialSkills: (detail._links?.hasEssentialSkill ?? []).map((s) => s.title ?? "").filter(Boolean),
          optionalSkills: (detail._links?.hasOptionalSkill ?? []).map((s) => s.title ?? "").filter(Boolean),
        };
      } catch {
        return null;
      }
    });
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  // A single search can fan out into several sequential ESCO calls (occupation
  // search + per-hit detail fetches for job families), so the budget must
  // cover the whole chain — 5s caused intermittent aborts under load, which
  // surfaced as false "No matches found" in the wizard.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
