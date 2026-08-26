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

/**
 * Fallback universities when the DB catalog is empty.
 *
 * The candidate sees real institutions and can still type new ones.
 */
const FALLBACK_UNIVERSITIES: { name: string; country: string }[] = [
  { name: "University of Malawi", country: "Malawi" },
  { name: "University of Lilongwe", country: "Malawi" },
  { name: "Mzuzu University", country: "Malawi" },
  { name: "Malawi University of Science and Technology", country: "Malawi" },
  { name: "Kamuzu University of Health Sciences", country: "Malawi" },
  { name: "University of Nairobi", country: "Kenya" },
  { name: "Kenyatta University", country: "Kenya" },
  { name: "Strathmore University", country: "Kenya" },
  { name: "United States International University - Africa", country: "Kenya" },
  { name: "Makerere University", country: "Uganda" },
  { name: "University of Dar es Salaam", country: "Tanzania" },
  { name: "Ardhi University", country: "Tanzania" },
  { name: "University of Lagos", country: "Nigeria" },
  { name: "University of Ibadan", country: "Nigeria" },
  { name: "Ahmadu Bello University", country: "Nigeria" },
  { name: "Covenant University", country: "Nigeria" },
  { name: "University of Cape Town", country: "South Africa" },
  { name: "University of the Witwatersrand", country: "South Africa" },
  { name: "Stellenbosch University", country: "South Africa" },
  { name: "University of Pretoria", country: "South Africa" },
  { name: "Rhodes University", country: "South Africa" },
  { name: "University of Ghana", country: "Ghana" },
  { name: "Kwame Nkrumah University of Science and Technology", country: "Ghana" },
  { name: "Ashesi University", country: "Ghana" },
  { name: "University of Rwanda", country: "Rwanda" },
  { name: "African Leadership University", country: "Rwanda" },
  { name: "University of Zambia", country: "Zambia" },
  { name: "Copperbelt University", country: "Zambia" },
  { name: "University of Zimbabwe", country: "Zimbabwe" },
  { name: "National University of Science and Technology", country: "Zimbabwe" },
  { name: "University of Botswana", country: "Botswana" },
  { name: "University of Eswatini", country: "Eswatini" },
  { name: "National University of Lesotho", country: "Lesotho" },
  { name: "University of Namibia", country: "Namibia" },
  { name: "Eduardo Mondlane University", country: "Mozambique" },
  { name: "Addis Ababa University", country: "Ethiopia" },
  { name: "University of Mauritius", country: "Mauritius" },
  { name: "Harvard University", country: "United States" },
  { name: "Stanford University", country: "United States" },
  { name: "University of Oxford", country: "United Kingdom" },
  { name: "University of Cambridge", country: "United Kingdom" },
  { name: "London School of Economics", country: "United Kingdom" },
  { name: "University of Toronto", country: "Canada" },
  { name: "McGill University", country: "Canada" },
  { name: "University of Melbourne", country: "Australia" },
  { name: "University of Delhi", country: "India" },
  { name: "Indian Institute of Technology Delhi", country: "India" },
];

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
  try {
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
  if (rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      country: row.country,
      domains: row.domains ? JSON.parse(row.domains) : null,
      web_pages: row.web_pages ? JSON.parse(row.web_pages) : null,
    }));
  }
  } catch {
    // Table may not exist yet
  }

  // Fallback: search in-memory list when DB table is empty/unreachable
  const lcQuery = trimmed.toLowerCase();
  const lcCountry = country?.toLowerCase() ?? null;
  const fallback = FALLBACK_UNIVERSITIES.filter((entry) => {
    if (lcCountry && entry.country.toLowerCase() !== lcCountry) return false;
    return entry.name.toLowerCase().includes(lcQuery);
  }).slice(0, limit);
  return fallback.map((entry, idx) => ({
    id: "fallback_" + idx + "_" + entry.name.replace(/[^a-z0-9]/gi, "-").slice(0, 40),
    name: entry.name,
    country: entry.country,
    domains: null,
    web_pages: null,
  }));
}
