import { from } from "@/lib/db";
import type { TaxonomyEntry, TaxonomyProvider } from "./types";

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/\bms\b/g, "microsoft")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreMatch(query: string, label: string): number {
  const q = normalise(query);
  const l = normalise(label);
  if (!q || !l) return 0;
  if (l === q) return 3;
  if (l.startsWith(q)) return 2;
  if (l.includes(q)) return 1;
  const qTerms = q.split(/\s+/);
  const matched = qTerms.filter((term) => l.includes(term)).length;
  return matched >= Math.max(1, Math.ceil(qTerms.length / 2)) ? 0.75 : 0;
}

async function searchTable(
  table: "job_titles" | "skill_library" | "fields_of_study" | "job_families",
  query: string,
  limit: number,
): Promise<TaxonomyEntry[]> {
  const builder = from(table).select("id, name").order("name");
  const result = await builder._exec();
  if (result.error || !result.data) return [];
  const rows = result.data as { id: string; name: string }[];
  return rows
    .map((row) => ({ entry: { id: row.id, label: row.name, source: "local" as const }, score: scoreMatch(query, row.name) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map((item) => item.entry);
}

/** The canonical DB catalogs are the single source and storage of taxonomy. */
export class LocalProvider implements TaxonomyProvider {
  readonly name = "local";

  searchOccupations(query: string, limit = 8) {
    return searchTable("job_titles", query, limit);
  }

  searchSkills(query: string, limit = 8) {
    return searchTable("skill_library", query, limit);
  }

  searchFieldsOfStudy(query: string, limit = 8) {
    return searchTable("fields_of_study", query, limit);
  }

  searchJobFamilies(query: string, limit = 8) {
    return searchTable("job_families", query, limit);
  }
}
