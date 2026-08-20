import type { TaxonomyEntry, TaxonomyProvider } from "./types";

/**
 * O*NET Web Services v2 — a second, independent taxonomy for occupations and
 * key responsibilities (tasks). O*NET is maintained by the US Department of
 * Labor and its Web Services are free for commercial and non-commercial use,
 * but require a (free) registration at https://services.onetcenter.org/ to
 * obtain an API key.
 *
 * Activation: set `ONET_API_KEY` to your key. When absent the provider returns
 * no results, so ESCO stays the working default. Endpoint shapes follow the
 * published OpenAPI spec (https://services.onetcenter.org/reference/openapi.json).
 */

const ONET_BASE = "https://api-v2.onetcenter.org";

function apiKey() {
  return process.env["ONET_API_KEY"]?.trim() ?? "";
}

export function isOnetConfigured() {
  return Boolean(apiKey());
}

type OnetSearchResult = {
  occupation?: { href?: string; code?: string; title?: string }[];
};

type OnetTasksResult = {
  task?: { id?: string; related?: string; title?: string }[];
};

async function onetGet(
  path: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("O*NET API key is not configured");
  const url = new URL(`${ONET_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { signal, headers: { "X-API-Key": key } });
  if (!response.ok) throw new Error(`O*NET returned ${response.status}`);
  return (await response.json()) as unknown;
}

/** Occupations + key responsibilities (tasks) from O*NET. */
export class OnetProvider implements TaxonomyProvider {
  readonly name = "onet";

  async searchOccupations(query: string, limit = 8): Promise<TaxonomyEntry[]> {
    return withTimeout(async (signal) => {
      const payload = (await onetGet("/online/search", { keyword: query }, signal)) as OnetSearchResult;
      const entries: TaxonomyEntry[] = [];
      for (const occupation of payload.occupation ?? []) {
        if (!occupation.title) continue;
        const entry: TaxonomyEntry = {
          id: occupation.code ?? occupation.title,
          label: occupation.title,
          source: "onet",
        };
        if (occupation.code) entry.externalId = occupation.code;
        entries.push(entry);
        if (entries.length >= limit) break;
      }
      return entries;
    });
  }

  async searchSkills(_query: string, _limit = 8): Promise<TaxonomyEntry[]> {
    // O*NET skills are rated per occupation rather than searchable as a flat
    // catalog — ESCO covers the skill search.
    return [];
  }

  async searchFieldsOfStudy(_query: string, _limit = 8): Promise<TaxonomyEntry[]> {
    return [];
  }

  async searchJobFamilies(_query: string, _limit = 8): Promise<TaxonomyEntry[]> {
    return [];
  }

  /**
   * Key responsibilities for an occupation, resolved by title: keyword search
   * for the closest SOC occupation, then that occupation's task list. Task
   * statements are real duty text ("Modify existing software to correct
   * errors..."), which is exactly what a vacancy's Key Responsibilities
   * section wants.
   *
   * The search hit is VERIFIED against the requested title before its tasks
   * are imported. O*NET groups related occupations (e.g. "Accountants and
   * Auditors"), so taking the raw first hit for "accountant" used to pull in
   * auditor task statements. The best-matching hit is chosen by term overlap
   * and composite titles are penalised, so "accountant" resolves to the
   * Accountants occupation instead of the auditors group.
   */
  async searchDuties(occupationTitle: string, limit = 15): Promise<TaxonomyEntry[]> {
    return withTimeout(async (signal) => {
      const hits = (await onetGet(
        "/online/search",
        { keyword: occupationTitle },
        signal,
      )) as OnetSearchResult;
      let best: { code?: string; title?: string } | null = null;
      let bestScore = 0;
      for (const occupation of hits.occupation ?? []) {
        if (!occupation.title) continue;
        const score = onetTitleScore(occupationTitle, occupation.title);
        if (score > bestScore) {
          bestScore = score;
          best = occupation;
        }
      }
      // A weak match (e.g. unrelated keyword spillover) imports nothing rather
      // than the wrong occupation's tasks.
      if (!best?.code || bestScore < 0.5) return [];
      // Fetch a wider window than requested so that filtering merged-group
      // statements (auditor tasks out of accountant lists) still yields a full
      // result set.
      const fetchWindow = Math.min(Math.max(limit * 2, limit + 6), 40);
      const tasks = (await onetGet(
        `/online/occupations/${encodeURIComponent(best.code)}/details/tasks`,
        { start: "1", end: String(fetchWindow) },
        signal,
      )) as OnetTasksResult;
      // The public O*NET API only exposes merged SOC groups ("Accountants and
      // Auditors"), whose task list mixes both occupations. When the query is
      // not itself about auditing, drop the auditor-specific statements so
      // "accountant" imports accountant work, not auditor work.
      const wantAudit = occupationTitle.toLowerCase().includes("audit");
      const entries: TaxonomyEntry[] = [];
      for (const task of tasks.task ?? []) {
        if (!task.title) continue;
        if (!wantAudit && isAuditorTask(task.title)) continue;
        entries.push({
          id: task.id ?? task.title,
          label: task.title,
          source: "onet",
          externalId: best.code,
        });
        if (entries.length >= limit) break;
      }
      return entries;
    });
  }
}

/** Stems a single term: lowercases, strips punctuation and trailing plurals. */
/** Phrases that mark a task statement as auditor-specific rather than general accounting work. */
const AUDITOR_TASK_MARKERS = [
  "audit findings",
  "auditing of",
  "audit payroll",
  "audits on-site",
  "pre-implementation audits",
  "deficient controls",
  "inspect account books",
  "examine records and interview workers",
  "supervise auditing",
];

/** Whether an O*NET task statement belongs to the auditor side of a merged group. */
function isAuditorTask(label: string): boolean {
  const lower = label.toLowerCase();
  return AUDITOR_TASK_MARKERS.some((marker) => lower.includes(marker));
}

function stemTerm(term: string): string {
  const cleaned = term.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return cleaned.length > 3 && cleaned.endsWith("s") ? cleaned.slice(0, -1) : cleaned;
}

function termSet(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(stemTerm)
    .filter((term) => term.length > 1 && !["and", "the", "of", "for", "with"].includes(term));
}

/**
 * 0..1 match score between the requested title and an O*NET result title.
 * Rewards how much of the query is covered and how "pure" the hit is — a
 * composite group ("Accountants and Auditors") loses points for its extra
 * terms, so the specific occupation ("Accountants") wins for "accountant".
 */
function onetTitleScore(query: string, title: string): number {
  const queryTerms = termSet(query);
  const titleTerms = termSet(title);
  if (!queryTerms.length || !titleTerms.length) return 0;
  const titleSet = new Set(titleTerms);
  const covered = queryTerms.filter((term) => titleSet.has(term)).length;
  const coverage = covered / queryTerms.length;
  const extra = titleTerms.filter((term) => !queryTerms.includes(term)).length;
  const purity = titleTerms.length === 0 ? 0 : (titleTerms.length - extra) / titleTerms.length;
  return coverage * 0.6 + purity * 0.4;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
