import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbQuery } from "@/lib/db";

const certificationSearchSchema = z.object({
  query: z.string().trim().max(160).optional().default(""),
  limit: z.number().int().min(1).max(30).optional().default(12),
});

export type CertificationEntry = {
  id: string;
  name: string;
  category: string | null;
};

/**
 * Searchable dropdown data for the certification library — the same master
 * catalog recruiters pick from when creating a campaign, so candidate
 * selections always match the scoring vocabulary.
 */
export const searchCertificationCatalog = createServerFn({ method: "POST" })
  .validator((input: unknown) => certificationSearchSchema.parse(input))
  .handler(async ({ data }) => {
    const trimmed = data.query.trim();
    const rows = (await dbQuery(
      `SELECT id, name, category
       FROM certification_library
       WHERE ? = '' OR name LIKE '%' || ? || '%' 
       ORDER BY
         CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
         name
       LIMIT ?`,
      [trimmed, trimmed, trimmed, trimmed ? `${trimmed}%` : "", data.limit],
    )) as unknown as CertificationEntry[];
    return { data: rows };
  });
