import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTaxonomyProvider, isOnetConfigured } from "@/lib/taxonomy";
import type { EscoOccupationDetail } from "@/lib/taxonomy/esco";
import type { TaxonomyEntry, TaxonomyKind } from "@/lib/taxonomy/types";

const taxonomySearchSchema = z.object({
  kind: z.enum(["occupation", "skill", "field_of_study", "job_family"]),
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(20).optional(),
});

/** Searches the taxonomy (ESCO by default) from the browser. */
export const searchTaxonomy = createServerFn({ method: "POST" })
  .validator((input: unknown) => taxonomySearchSchema.parse(input))
  .handler(async ({ data }) => {
    const provider = getTaxonomyProvider();
    const limit = data.limit ?? 8;
    let results: TaxonomyEntry[] = await (async () => {
      switch (data.kind) {
        case "occupation":
          return provider.searchOccupations(data.query, limit);
        case "skill":
          return provider.searchSkills(data.query, limit);
        case "field_of_study":
          return provider.searchFieldsOfStudy(data.query, limit);
        case "job_family":
          return provider.searchJobFamilies?.(data.query, limit) ?? [];
      }
    })();

    // Manually added job titles (the Missing Data master) always surface in
    // occupation searches, ahead of external-catalog noise, so a title one
    // recruiter added is found by every tenant next time.
    if (data.kind === "occupation") {
      const { dbQuery } = await import("@/lib/db");
      const q = data.query.trim();
      const rows = (await dbQuery(
        `SELECT id, name FROM job_title_master
         WHERE name LIKE '%' || ? || '%'
         ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name
         LIMIT ?`,
        [q, `${q}%`, 5],
      )) as unknown as { id: string; name: string }[];
      if (rows.length) {
        const masterEntries: TaxonomyEntry[] = rows.map((row) => ({
          id: row.id,
          label: row.name,
          source: "manual",
        }));
        const seen = new Set(results.map((entry) => entry.label.trim().toLowerCase()));
        results = [...masterEntries, ...results.filter((entry) => {
          const key = entry.label.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })].slice(0, limit);
      }
    }

    return { data: results };
  });

const addJobTitleSchema = z.object({
  name: z.string().trim().min(2).max(160),
});

/**
 * Adds a job title that no external catalog matched to the platform-wide
 * master. A controlled addition (deduped by normalized name) so an unusual
 * title becomes a one-time enrichment instead of a permanent dead end —
 * next searches surface it for every tenant.
 */
export const addJobTitleToMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => addJobTitleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { dbQueryFirst, dbExecute } = await import("@/lib/db");
    const name = data.name.trim();
    const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existing = (await dbQueryFirst(
      "SELECT id, name FROM job_title_master WHERE normalized_name = ?",
      [normalized],
    )) as { id: string; name: string } | null;
    if (existing) {
      return {
        data: {
          id: existing.id,
          label: existing.name,
          source: "manual" as const,
          created: false,
          status: "exists",
        },
      };
    }
    const id = crypto.randomUUID();
    await dbExecute(
      "INSERT INTO job_title_master (id, name, normalized_name, source, status, created_at) VALUES (?, ?, ?, 'manual', 'pending', NOW())",
      [id, name, normalized],
    );
    try {
      if (context.tenantId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("audit_logs").insert({
          tenant_id: context.tenantId,
          actor_id: context.userId ?? null,
          action: "master.job_title_added",
          entity: "job_title_master",
          entity_id: id,
        });
      }
    } catch {
      // Non-fatal — audit logging must never block a catalog addition.
    }
    return {
      data: {
        id,
        label: name,
        source: "manual" as const,
        created: true,
        status: "pending",
      },
    };
  });

const occupationDetailSchema = z.object({
  uri: z.string().trim().min(5).max(500),
});

/** Full detail for one occupation: duties (skills), family and hierarchy. */
export const occupationDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => occupationDetailSchema.parse(input))
  .handler(async ({ data }) => {
    const provider = getTaxonomyProvider() as {
      getOccupation?: (uri: string) => Promise<EscoOccupationDetail | null>;
    };
    const detail = provider.getOccupation ? await provider.getOccupation(data.uri) : null;
    return { data: detail };
  });

const onetDutiesSchema = z.object({
  title: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(30).optional(),
});

/**
 * Key responsibilities for an occupation from O*NET tasks. Requires the free
 * ONET_API_KEY to be configured; returns configured:false otherwise so the UI
 * can guide the recruiter.
 */
export const onetDuties = createServerFn({ method: "POST" })
  .validator((input: unknown) => onetDutiesSchema.parse(input))
  .handler(async ({ data }) => {
    if (!isOnetConfigured()) return { data: { configured: false, duties: [] as TaxonomyEntry[] } };
    const provider = getTaxonomyProvider() as {
      searchDuties?: (title: string, limit: number) => Promise<TaxonomyEntry[]>;
    };
    try {
      const duties = provider.searchDuties
        ? await provider.searchDuties(data.title, data.limit ?? 15)
        : [];
      return { data: { configured: true, duties } };
    } catch {
      return { data: { configured: true, duties: [] as TaxonomyEntry[] } };
    }
  });
