import { EscoProvider } from "./esco";
import { LocalProvider } from "./local";
import { OnetProvider, isOnetConfigured } from "./onet";
import type { TaxonomyEntry, TaxonomyKind, TaxonomyProvider } from "./types";

function dedupe(entries: TaxonomyEntry[]): TaxonomyEntry[] {
  const seen = new Set<string>();
  const out: TaxonomyEntry[] = [];
  for (const entry of entries) {
    const key = entry.label.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** ESCO first, local DB catalogs only as an offline fallback. */
class HybridProvider implements TaxonomyProvider {
  readonly name = "hybrid";
  private readonly esco = new EscoProvider();
  private readonly local = new LocalProvider();

  private async search(
    kind: TaxonomyKind,
    query: string,
    limit: number,
    escoSearch: (limit: number) => Promise<TaxonomyEntry[]>,
    localSearch: (limit: number) => Promise<TaxonomyEntry[]>,
  ): Promise<TaxonomyEntry[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    let escoEntries: TaxonomyEntry[] = [];
    try {
      escoEntries = await escoSearch(limit);
    } catch {
      // ESCO unreachable — fall back to the local DB copy.
    }
    const localEntries = await localSearch(limit * 2);
    return dedupe([...escoEntries, ...localEntries]).slice(0, limit);
  }

  searchOccupations(query: string, limit = 8) {
    return this.search(
      "occupation",
      query,
      limit,
      (l) => this.esco.searchOccupations(query, l),
      (l) => this.local.searchOccupations(query, l),
    );
  }

  searchSkills(query: string, limit = 8) {
    return this.search(
      "skill",
      query,
      limit,
      (l) => this.esco.searchSkills(query, l),
      (l) => this.local.searchSkills(query, l),
    );
  }

  searchFieldsOfStudy(query: string, limit = 8) {
    return this.search(
      "field_of_study",
      query,
      limit,
      () => Promise.resolve([]),
      (l) => this.local.searchFieldsOfStudy(query, l),
    );
  }

  searchJobFamilies(query: string, limit = 8) {
    return this.search(
      "job_family",
      query,
      limit,
      (l) => this.esco.searchJobFamilies?.(query, l) ?? Promise.resolve([]),
      (l) => this.local.searchJobFamilies?.(query, l) ?? this.local.searchOccupations(query, l),
    );
  }
}

/** ESCO plus O*NET — merged and deduped, active when ONET_API_KEY is set. */
class EscoOnetProvider implements TaxonomyProvider {
  readonly name = "esco+onet";
  private readonly esco = new EscoProvider();
  private readonly onet = new OnetProvider();

  private async merged(
    limit: number,
    escoSearch: (limit: number) => Promise<TaxonomyEntry[]>,
    onetSearch: (limit: number) => Promise<TaxonomyEntry[]>,
  ): Promise<TaxonomyEntry[]> {
    const [esco, onet] = await Promise.allSettled([escoSearch(limit), onetSearch(limit)]);
    // If one source fails but the other answers, keep its results. If the
    // primary source (ESCO) fails and the secondary came back empty — which is
    // the norm for kinds O*NET does not cover (skills, families) — throw so
    // the UI can say "could not reach the catalog" instead of pretending the
    // search genuinely found no matches.
    if (esco.status === "rejected" && (onet.status === "rejected" || onet.value.length === 0)) {
      throw new AggregateError(
        [esco.reason, onet.status === "rejected" ? onet.reason : new Error("no secondary results")],
        "Both taxonomy providers failed",
      );
    }
    return dedupe([
      ...(esco.status === "fulfilled" ? esco.value : []),
      ...(onet.status === "fulfilled" ? onet.value : []),
    ]).slice(0, limit);
  }

  searchOccupations(query: string, limit = 8) {
    return this.merged(
      limit,
      (l) => this.esco.searchOccupations(query, l),
      (l) => this.onet.searchOccupations(query, l),
    );
  }

  searchSkills(query: string, limit = 8) {
    return this.merged(
      limit,
      (l) => this.esco.searchSkills(query, l),
      () => Promise.resolve([]),
    );
  }

  searchFieldsOfStudy(query: string, limit = 8) {
    // Fields of study have no ESCO or O*NET equivalent — standards layer.
    return new LocalProvider().searchFieldsOfStudy(query, limit);
  }

  searchJobFamilies(query: string, limit = 8) {
    return this.merged(
      limit,
      (l) => this.esco.searchJobFamilies?.(query, l) ?? Promise.resolve([]),
      () => Promise.resolve([]),
    );
  }

  /** Occupation detail (duties, family, hierarchy) comes from ESCO. */
  getOccupation(uri: string) {
    return this.esco.getOccupation(uri);
  }

  /** Key responsibilities from O*NET tasks. */
  searchDuties(occupationTitle: string, limit = 15) {
    return this.onet.searchDuties(occupationTitle, limit);
  }
}

const mode = () => process.env["TAXONOMY_PROVIDER"] ?? "esco";

/**
 * Returns the configured taxonomy provider. ESCO is the single source of
 * truth; when ONET_API_KEY is set, O*NET occupations and duties are merged in
 * for a wider catalog. Set TAXONOMY_PROVIDER=local|hybrid|onet|esco+onet.
 */
export function getTaxonomyProvider(): TaxonomyProvider {
  switch (mode()) {
    case "local":
      return new LocalProvider();
    case "hybrid":
      return new HybridProvider();
    case "onet":
      return new OnetProvider();
    case "esco+onet":
      return new EscoOnetProvider();
    default:
      return isOnetConfigured() ? new EscoOnetProvider() : new EscoProvider();
  }
}

export { isOnetConfigured };
