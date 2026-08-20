import { dbExecute, dbQuery } from "@/lib/db";

/**
 * University master library — institutions synced from the Hipo Universities
 * API (https://github.com/Hipo/university-domains-list, ~10k institutions).
 * The candidate education form searches this local table instead of calling
 * the external API per keystroke, and admins can correct entries locally.
 */

type HipoUniversity = {
  name: string;
  country: string;
  "state-province": string | null;
  alpha_two_code: string;
  domains: string[];
  web_pages: string[];
};

export type UniversityEntry = {
  id: string;
  name: string;
  country: string | null;
  domains: string[] | null;
  web_pages: string[] | null;
};

function stableId(name: string, country: string) {
  // Deterministic id so re-syncs upsert the same rows. A plain slug of the
  // name + country (no short hash — 32-bit hashes collide across 10k rows).
  const slug = `${name.toLowerCase()} ${country.toLowerCase()}`
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `uni_${slug.slice(0, 120)}`;
}

/** Fetches the full Hipo directory and upserts it into the local catalog. */
export async function syncUniversities(): Promise<{ inserted: number; updated: number; total: number }> {
  // Hipo serves plain HTTP (its HTTPS endpoint is unreliable) — fine for a
  // one-time master-data sync of public institution names.
  const response = await fetch("http://universities.hipolabs.com/search", {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Hipo API returned ${response.status}`);
  const data = (await response.json()) as HipoUniversity[];

  let inserted = 0;
  let updated = 0;
  for (const uni of data) {
    if (!uni.name) continue;
    const id = stableId(uni.name, uni.country ?? "");
    const result = await dbExecute(
      `INSERT INTO universities (id, name, country, alpha_two_code, domains, web_pages)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name, country) DO UPDATE SET
         alpha_two_code = excluded.alpha_two_code,
         domains = excluded.domains,
         web_pages = excluded.web_pages`,
      [
        id,
        uni.name,
        uni.country ?? null,
        uni.alpha_two_code ?? null,
        uni.domains?.length ? JSON.stringify(uni.domains) : null,
        uni.web_pages?.length ? JSON.stringify(uni.web_pages) : null,
      ],
    );
    if (result.rowsAffected === 1) inserted++;
    else updated++;
  }
  const countRows = (await dbQuery("SELECT COUNT(*) AS count FROM universities")) as unknown as {
    count: number;
  }[];
  return { inserted, updated, total: Number(countRows[0]?.count ?? 0) };
}

/**
 * Searchable dropdown data for the candidate education form. Name search is a
 * case-insensitive substring match, optionally narrowed by country so the
 * list stays relevant as the candidate types.
 */
export async function searchUniversities(
  query: string,
  country?: string | null,
  limit = 12,
): Promise<UniversityEntry[]> {
  const trimmed = query.trim();
  const rows = (await dbQuery(
    `SELECT id, name, country, domains, web_pages
     FROM universities
     WHERE (? = '' OR name LIKE '%' || ? || '%')
       AND (? IS NULL OR country = ?)
     ORDER BY
       CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
       name
     LIMIT ?`,
    [trimmed, trimmed, country ?? null, country ?? null, trimmed ? `${trimmed}%` : "", limit],
  )) as unknown as {
    id: string;
    name: string;
    country: string | null;
    domains: string | null;
    web_pages: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
    domains: row.domains ? JSON.parse(row.domains) : null,
    web_pages: row.web_pages ? JSON.parse(row.web_pages) : null,
  }));
}
