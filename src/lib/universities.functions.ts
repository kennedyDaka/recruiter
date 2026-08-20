import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  searchUniversities,
  type UniversityEntry,
} from "@/lib/university-catalog";

const universitySearchSchema = z.object({
  query: z.string().trim().max(160).optional().default(""),
  country: z.string().trim().max(80).nullable().optional(),
  limit: z.number().int().min(1).max(30).optional().default(12),
});

/** Searchable dropdown data for the candidate education form (university field). */
export const searchUniversityCatalog = createServerFn({ method: "POST" })
  .validator((input: unknown) => universitySearchSchema.parse(input))
  .handler(async ({ data }) => {
    const results = await searchUniversities(data.query, data.country, data.limit);
    return { data: results };
  });

const addUniversitySchema = z.object({
  name: z.string().trim().min(2).max(200),
  country: z.string().trim().max(80).nullable().optional(),
});

/**
 * Adds an institution the Hipo import doesn't cover (a private or newly
 * opened university) to the master library as a controlled addition — marked
 * source=manual / status=pending so it's trackable, and searchable for every
 * future applicant. The scoring engine never depends on the institution
 * existing in an external API: it grades qualification level, field and
 * country attributes, so a newly added university scores normally.
 */
export const addUniversityToMaster = createServerFn({ method: "POST" })
  .validator((input: unknown) => addUniversitySchema.parse(input))
  .handler(async ({ data }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");
    const name = data.name.trim();
    const country = data.country?.trim() || null;

    const existing = (await dbQueryFirst(
      "SELECT id, name, country FROM universities WHERE LOWER(name) = LOWER(?) AND (country = ? OR ? IS NULL)",
      [name, country, country],
    )) as { id: string; name: string; country: string | null } | null;

    if (existing) {
      const entry: UniversityEntry = {
        id: existing.id,
        name: existing.name,
        country: existing.country,
        domains: null,
        web_pages: null,
      };
      return { data: { entry, created: false, status: "exists" } };
    }

    const id = crypto.randomUUID();
    await dbExecute(
      "INSERT INTO universities (id, name, country, source, status, domains, web_pages) VALUES (?, ?, ?, 'manual', 'pending', NULL, NULL)",
      [id, name, country],
    );
    const entry: UniversityEntry = {
      id,
      name,
      country,
      domains: null,
      web_pages: null,
    };
    return { data: { entry, created: true, status: "pending" } };
  });
