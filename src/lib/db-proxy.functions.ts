import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { from, dbQueryFirst } from "@/lib/db";
import { TENANT_SCOPED_TABLES } from "@/lib/tenant-guard";

const sqlPartSchema = z.object({
  sql: z.string().max(500),
  args: z.array(z.unknown()).optional(),
});
const errorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

const chainSchema = z.object({
  table: z.string().regex(/^[a-z_]+$/),
  op: z.enum(["select", "insert", "update", "upsert", "delete"]),
  selectTokens: z.array(z.string().max(300)).optional(),
  joins: z
    .array(
      z.object({
        table: z.string().regex(/^[a-z_]+$/),
        cols: z.array(z.string().max(100)).nullable(),
        on: z.string().max(300),
      }),
    )
    .optional(),
  where: z.array(sqlPartSchema).optional(),
  orderBy: sqlPartSchema.nullable().optional(),
  limit: z.number().int().nullable().optional(),
  insertData: z.unknown().optional(),
  updateData: z.unknown().optional(),
  onConflictCols: z.array(z.string().max(100)).optional(),
});

// ---------------------------------------------------------------------------
// Security policy
//
// The browser proxy is the only client->DB path, and its `where`/`orderBy`/
// `on` fragments are interpolated verbatim into SQL (values are always bound
// as parameters, but the SQL text itself is client-controlled). Everything
// below is enforced server-side; the client is never trusted.
// ---------------------------------------------------------------------------

/** Auth/global/payment internals — never readable through the browser proxy. */
const PROXY_FORBIDDEN_TABLES = new Set([
  "auth_credentials",
  "auth_attempts",
  "profiles",
  "user_roles",
  "audit_logs",
  "webhook_logs",
  "payments",
  "invoices",
  "subscriptions",
  "interview_scores",
]);

/** Shared public catalogs — safe for any visitor. */
const PUBLIC_CATALOG_TABLES = new Set([
  "skill_library",
  "fields_of_study",
  "job_families",
  "industries",
  "certification_library",
  "license_library",
  "universities",
  "job_title_master",
  "job_titles",
  "plans",
]);

/**
 * Tenant-owned tables anonymous visitors may read — and ONLY when the query
 * provably targets a publicly visible campaign (verified server-side in
 * anonymousTenantReadAllowed). Everything else tenant-owned requires a
 * signed-in session.
 */
const ANONYMOUS_READABLE_TENANT_TABLES = new Set([
  "campaigns",
  "campaign_questions",
  "campaign_answer_options",
]);

/** Tables a public read may JOIN (FK-limited to the public campaign rows). */
const PUBLIC_JOIN_TABLES = new Set([
  "tenants",
  "campaign_answer_options",
  ...PUBLIC_CATALOG_TABLES,
]);

const PUBLIC_CAMPAIGN_STATUSES = new Set(["active", "closing_soon"]);

/**
 * tenants.settings may hold provider secrets (SMTP/WhatsApp keys, see
 * tenant-settings.ts). It must never cross the proxy — only the public
 * profile columns are exposed.
 */
const TENANT_READABLE_COLUMNS = new Set([
  "id",
  "name",
  "slug",
  "industry",
  "country",
  "city",
  "phone",
  "email",
  "website",
  "logo_url",
  "primary_color",
  "secondary_color",
  "created_at",
  "updated_at",
]);

const COL = "[a-z_][a-z0-9_]*";

/** Whitelist of WHERE fragments the builder can generate (raw, unqualified). */
const WHERE_FRAGMENT_RE = new RegExp(
  "^" +
    `${COL} IS (NOT )?NULL` +
    "|" +
    `${COL} (NOT )?IN \\(\\?(, \\?)*\\)` +
    "|" +
    `${COL} (=|!=|<>|>|>=|<|<=|LIKE|NOT LIKE|GLOB) \\?` +
    "|" +
    `${COL} BETWEEN \\? AND \\?` +
    "|" +
    "1 = 0" +
    "$",
);

const ORDER_BY_RE = new RegExp(`^ORDER BY ${COL} (ASC|DESC)$`);

/** A select token must be `*` or a plain column identifier — never an
 * expression or a relation token (relations arrive as `joins`). */
const SELECT_TOKEN_RE = new RegExp(`^(\\*|${COL})$`);

const JOIN_ON_RE = new RegExp(`^(${COL})\\.(${COL}) = (${COL})\\.id$`);

/** Rejects a query with a generic message (details never reach the client). */
function rejected(message = "Query rejected by security policy.") {
  return { data: null, error: { message } };
}

/** Is the campaign publicly visible (published now or ever)? */
async function isPublicCampaignById(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const row = await dbQueryFirst("SELECT status, published_at FROM campaigns WHERE id = ?", [id]);
  if (!row) return false;
  return row.published_at != null || PUBLIC_CAMPAIGN_STATUSES.has(row.status);
}

/**
 * Server-side gate for anonymous reads of tenant-owned tables. Only queries
 * that provably target a published campaign pass.
 */
async function anonymousTenantReadAllowed(
  table: string,
  where: Array<{ sql: string; args: unknown[] }> | undefined,
): Promise<boolean> {
  const fragments = where ?? [];
  for (const fragment of fragments) {
    if (table === "campaigns") {
      if (fragment.sql === "public_token = ?") {
        const token = fragment.args?.[0];
        if (typeof token !== "string") return false;
        const row = await dbQueryFirst("SELECT id FROM campaigns WHERE public_token = ?", [token]);
        if (!row) return false;
        return isPublicCampaignById(row.id);
      }
      if (fragment.sql === "id = ?") {
        const id = fragment.args?.[0];
        return typeof id === "string" && isPublicCampaignById(id);
      }
      if (/^status (NOT )?IN \(\?(, \?)*\)$/.test(fragment.sql)) {
        return (fragment.args ?? []).every((value) => PUBLIC_CAMPAIGN_STATUSES.has(String(value)));
      }
    }
    if (
      (table === "campaign_questions" || table === "campaign_answer_options") &&
      fragment.sql === "campaign_id = ?"
    ) {
      const id = fragment.args?.[0];
      return typeof id === "string" && isPublicCampaignById(id);
    }
  }
  return false;
}

/** Validates a join: FK-pattern ON clause linking exactly main + join table. */
function joinAllowed(main: string, join: { table: string; on: string }): boolean {
  if (PROXY_FORBIDDEN_TABLES.has(join.table)) return false;
  const match = JOIN_ON_RE.exec(join.on);
  if (!match) return false;
  const leftTable = match[1]!;
  const rightTable = match[3]!;
  const pair = new Set([leftTable, rightTable]);
  return pair.has(main) && pair.has(join.table);
}

/**
 * Executes a query chain on the server for browser-side code. The local
 * SQLite file is only reachable from the server, so routes proxy their reads
 * here. Writes are rejected — they must go through authenticated server
 * functions (see src/lib/recruiter.functions.ts).
 */
export const dbQueryProxy = createServerFn({ method: "POST" })
  .validator((input: unknown) => chainSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.op !== "select") {
      return rejected("Only SELECT queries can be executed through the client proxy.");
    }
    if (PROXY_FORBIDDEN_TABLES.has(data.table)) {
      return rejected("This table is not readable through the client proxy.");
    }

    // Validate every fragment before trusting it — the SQL text is client
    // controlled and is interpolated verbatim by the query builder.
    const whereFragments: Array<{ sql: string; args: unknown[] }> = (data.where ?? []).map(
      (fragment) => ({ sql: fragment.sql, args: fragment.args ?? [] }),
    );
    if (whereFragments.some((f) => !WHERE_FRAGMENT_RE.test(f.sql))) {
      return rejected();
    }
    if (data.orderBy && !ORDER_BY_RE.test(data.orderBy.sql)) {
      return rejected();
    }
    if ((data.selectTokens ?? []).some((token) => !SELECT_TOKEN_RE.test(token))) {
      return rejected();
    }
    if ((data.joins ?? []).some((j) => (j.cols ?? []).some((c) => !SELECT_TOKEN_RE.test(c)))) {
      return rejected();
    }
    const joins = data.joins ?? [];
    if (joins.some((j) => !joinAllowed(data.table, j))) {
      return rejected();
    }

    // Column policy for `tenants`: strip settings (and any unknown column).
    let selectTokens = data.selectTokens?.length ? data.selectTokens : ["*"];
    if (data.table === "tenants") {
      selectTokens = selectTokens.includes("*")
        ? [...TENANT_READABLE_COLUMNS]
        : selectTokens.filter((token) => TENANT_READABLE_COLUMNS.has(token));
      if (selectTokens.length === 0) selectTokens = [...TENANT_READABLE_COLUMNS];
    }
    const safeJoins = joins.map((join) => {
      if (join.table !== "tenants") return join;
      if (join.cols === null) return { ...join, cols: [...TENANT_READABLE_COLUMNS] };
      const cols = join.cols.filter((c) => TENANT_READABLE_COLUMNS.has(c));
      return { ...join, cols: cols.length ? cols : ["id"] };
    });

    // The builder's internals are private and cannot be typed structurally; the
    // chain is replayed through the same loose handle the rest of the codebase
    // uses (see db.ts), with every field below validated by the chain schema.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const builder = from(data.table) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    builder._op = data.op;
    builder._selectTokens = selectTokens;
    builder._joins = safeJoins;
    builder._where = whereFragments;
    builder._orderBy = data.orderBy
      ? { sql: data.orderBy.sql, args: data.orderBy.args ?? [] }
      : null;
    builder._limit = data.limit ?? null;

    // Tenant isolation: scope tenant-owned reads to the signed-in session's
    // tenant, resolved from the database (profiles.tenant_id) — never from the
    // JWT claim, so a stale or forged claim cannot cross tenants.
    const { getSessionFromCookieServer } = await import("@/lib/auth/session.server");
    const { resolveTenantIdForUser } = await import("@/lib/tenant-guard");
    const session = await getSessionFromCookieServer();

    if (TENANT_SCOPED_TABLES.has(data.table)) {
      const isPublicIntent =
        whereFragments.some((f) => f.sql === "public_token = ?") ||
        (data.table !== "campaigns" && whereFragments.some((f) => f.sql === "campaign_id = ?"));

      if (session && !isPublicIntent) {
        // Signed-in read of tenant-owned data: the tenant is always the
        // session's own tenant, and the client must not pick one.
        if (whereFragments.some((f) => f.sql.includes("tenant_id"))) {
          return rejected("tenant_id is controlled by the server.");
        }
        const tenantId = await resolveTenantIdForUser(session.userId);
        if (!tenantId) {
          return rejected("No tenant is bound to this account.");
        }
        builder._where.push({ sql: "tenant_id = ?", args: [tenantId] });
      } else if (isPublicIntent) {
        // Public campaign material (apply link, public questions): verified
        // server-side against the published campaign, for anonymous and
        // signed-in visitors alike.
        if (!(await anonymousTenantReadAllowed(data.table, whereFragments))) {
          return rejected();
        }
        if (joins.some((j) => !PUBLIC_JOIN_TABLES.has(j.table))) {
          return rejected();
        }
      } else {
        // Anonymous read of a tenant-owned table that is not public campaign
        // material (applications, candidates, notes, …) — rejected.
        if (!ANONYMOUS_READABLE_TENANT_TABLES.has(data.table)) {
          return rejected("Authentication required for this query.");
        }
        if (!(await anonymousTenantReadAllowed(data.table, whereFragments))) {
          return rejected();
        }
        if (joins.some((j) => !PUBLIC_JOIN_TABLES.has(j.table))) {
          return rejected();
        }
      }
    }

    // The proxy must never throw: pages check `error` on the result and apply
    // fallbacks (e.g. the campaign wizard's catalog queries). A rejected RPC
    // surfaces as a react-query error instead, leaving dropdowns empty.
    try {
      return await builder._exec();
    } catch (e) {
      console.error("[db-proxy] query failed", e);
      return { data: null, error: { message: "Query failed." } };
    }
  });
