/**
 * Cross-tenant isolation test.
 *
 * Verifies that a recruiter can never read or mutate another tenant's data,
 * even when the session JWT carries a forged/stale tenantId claim — the
 * authoritative tenant is always re-resolved from `profiles.tenant_id`.
 *
 * Two layers are exercised:
 *   1. Direct DB layer  — tenantScopedFrom() scoped builders (WHERE injection,
 *      insert stamping, update/delete refusal).
 *   2. HTTP server-fn   — the real dbQueryProxy endpoint with a forged session
 *      cookie: querying another tenant's campaign must return nothing, while
 *      the same user's own campaign still resolves.
 *
 * Prereq: the dev server must be running (npm run dev) — the HTTP part calls
 * http://localhost:5174. Run:  bun scripts/test-tenant-isolation.ts
 */

import "dotenv/config";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { dbExecute, dbQueryFirst, from } from "../src/lib/db";
import { resolveTenantIdForUser, tenantScopedFrom } from "../src/lib/tenant-guard";

const BASE = process.env["TEST_BASE_URL"] ?? "http://localhost:5174";
const JWT_SECRET =
  process.env["JWT_SECRET"] ?? "dev-secret-change-me";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

async function createSession(userId: string, email: string, claimedTenantId: string | null) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({
    userId,
    email,
    // The attack being tested: the claim claims tenant B while the DB says A.
    ...(claimedTenantId ? { tenantId: claimedTenantId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3600s")
    .setIssuer("hire-flow")
    .sign(secret);
}

/** Serializes a dbQueryProxy chain the way the TanStack client does. */
async function proxyBody(payload: unknown): Promise<string> {
  const { toJSONAsync } = await import("seroval");
  const serialized = await toJSONAsync({ data: payload }, { plugins: [] });
  return JSON.stringify(serialized);
}

async function callProxy(chain: unknown, token: string) {
  const endpoint = "/_serverFn/" +
    Buffer.from(
      JSON.stringify({
        file: "/src/lib/db-proxy.functions.ts?tss-serverfn-split",
        export: "dbQueryProxy_createServerFn_handler",
      }),
    ).toString("base64url");
  const res = await fetch(BASE + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-tsr-serverFn": "true",
      Origin: BASE,
      Cookie: `hf_session=${encodeURIComponent(token)}`,
    },
    body: await proxyBody(chain),
  });
  if (res.status !== 200) {
    const body = (await res.text()).slice(0, 500);
    return { data: null, error: { message: `HTTP ${res.status}: ${body}` }, status: res.status };
  }
  const body = await res.text();
  // The response body is seroval-encoded: { t, i, p, o } — decode it to the
  // real envelope { result: { data: <actual>, error }, context }.
  let decoded: any = body;
  try {
    const { fromCrossJSON } = await import("seroval");
    const { defaultSerovalPlugins } = await import("@tanstack/router-core");
    decoded = fromCrossJSON(JSON.parse(body), { plugins: defaultSerovalPlugins });
  } catch (e) {
    decoded = body;
  }
  // Envelope: { result: { data: <actual>, error }, context }.
  const result = decoded?.result;
  const data = result?.data;
  const error = result?.error;
  return { data, error, status: res.status };
}

// ─── Setup: two isolated tenants, two users, one campaign each ────────
const tenantAId = randomUUID();
const tenantBId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const emailA = `iso-a-${Date.now()}@example.com`;
const emailB = `iso-b-${Date.now()}@example.com`;

async function insertCampaign(tenantId: string, title: string) {
  const id = randomUUID();
  await dbExecute(
    `INSERT INTO campaigns (id, tenant_id, name, job_title, status, slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, datetime('now'), datetime('now'))`,
    [id, tenantId, title, title, `${title}-${Date.now()}`],
  );
  return id;
}

async function setup() {
  await dbExecute(
    "INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    [tenantAId, "Isolation Tenant A", `iso-a-${Date.now()}`],
  );
  await dbExecute(
    "INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    [tenantBId, "Isolation Tenant B", `iso-b-${Date.now()}`],
  );
  await dbExecute(
    "INSERT INTO profiles (id, full_name, email, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
    [userAId, "User A", emailA, tenantAId],
  );
  await dbExecute(
    "INSERT INTO profiles (id, full_name, email, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
    [userBId, "User B", emailB, tenantBId],
  );
  const campaignA = await insertCampaign(tenantAId, "Campaign A");
  const campaignB = await insertCampaign(tenantBId, "Campaign B");
  return { campaignA, campaignB };
}

async function teardown() {
  for (const id of [tenantAId, tenantBId]) {
    await dbExecute("DELETE FROM campaigns WHERE tenant_id = ?", [id]);
    await dbExecute("DELETE FROM profiles WHERE id IN (?, ?)", [userAId, userBId]);
    await dbExecute("DELETE FROM tenants WHERE id = ?", [id]);
  }
}

// ─── 1. DB layer: scoped builders ────────────────────────────────────
async function testDbLayer(campaignA: string, campaignB: string) {
  console.log("\n[1] DB layer — tenantScopedFrom()");

  const scopedA = tenantScopedFrom(tenantAId);
  const scopedB = tenantScopedFrom(tenantBId);

  // Read: tenant A's scope must not see tenant B's campaign.
  const crossRead = await scopedA("campaigns").select("id").eq("id", campaignB).maybeSingle();
  check(
    "A cannot read B's campaign by id",
    !crossRead.data,
    crossRead.error ? `error: ${crossRead.error.message}` : `got: ${JSON.stringify(crossRead.data)}`,
  );

  // Read: tenant A's scope sees its own campaign.
  const ownRead = await scopedA("campaigns")
    .select("id, tenant_id")
    .eq("id", campaignA)
    .maybeSingle();
  check("A can read its own campaign", Boolean(ownRead.data), JSON.stringify(ownRead.data));
  if (ownRead.data) {
    check("own campaign row has A's tenant_id", (ownRead.data as any).tenant_id === tenantAId);
  }

  // Read: tenant A listing must not include B's campaign.
  const list = await scopedA("campaigns").select("id, name").order("created_at", { ascending: true });
  const ids = (list.data ?? []).map((row: any) => row.id as string);
  check(
    "A's campaign list excludes B's campaign",
    !ids.includes(campaignB) && ids.includes(campaignA),
    `ids: ${JSON.stringify(ids)}`,
  );

  // Update: A updating B's campaign by id must affect zero rows.
  const crossUpdate = await scopedA("campaigns")
    .update({ name: "HACKED" })
    .eq("id", campaignB);
  check("A updating B's campaign affects zero rows", !crossUpdate.data?.count, JSON.stringify(crossUpdate.data));
  const after = await dbQueryFirst("SELECT name FROM campaigns WHERE id = ?", [campaignB]);
  check("B's campaign name unchanged", (after as any)?.name !== "HACKED", JSON.stringify(after));

  // Delete: A deleting B's campaign by id must affect zero rows.
  const crossDelete = await scopedA("campaigns").delete().eq("id", campaignB);
  check("A deleting B's campaign affects zero rows", !crossDelete.error, JSON.stringify(crossDelete.data));
  const stillThere = await dbQueryFirst("SELECT id FROM campaigns WHERE id = ?", [campaignB]);
  check("B's campaign still exists", Boolean(stillThere));

  // Insert: scoped insert must stamp tenant_id even if the caller passes another.
  const stampedId = randomUUID();
  await scopedA("campaigns").insert({
    id: stampedId,
    tenant_id: tenantBId, // attacker-supplied — must be overridden
    name: "Stamped",
    job_title: "Stamped",
    status: "draft",
    slug: `stamped-${Date.now()}`,
  });
  const stamped = await dbQueryFirst("SELECT tenant_id FROM campaigns WHERE id = ?", [stampedId]);
  check("insert stamps A's tenant_id, not the payload's", (stamped as any)?.tenant_id === tenantAId, JSON.stringify(stamped));
  await dbExecute("DELETE FROM campaigns WHERE id = ?", [stampedId]);

  // Upsert: same stamping.
  const upsertId = randomUUID();
  await scopedA("campaigns").upsert(
    { id: upsertId, tenant_id: tenantBId, name: "Upserted", job_title: "Upserted", status: "draft", slug: `up-${Date.now()}` },
    { onConflict: "id" },
  );
  const upserted = await dbQueryFirst("SELECT tenant_id FROM campaigns WHERE id = ?", [upsertId]);
  check("upsert stamps A's tenant_id", (upserted as any)?.tenant_id === tenantAId, JSON.stringify(upserted));
  await dbExecute("DELETE FROM campaigns WHERE id = ?", [upsertId]);
}

// ─── 2. Tenant resolution: DB beats the JWT claim ─────────────────────
async function testResolution() {
  console.log("\n[2] Tenant resolution — DB is authoritative");

  const resolvedA = await resolveTenantIdForUser(userAId);
  check("resolveTenantIdForUser(A) returns A's tenant", resolvedA === tenantAId, String(resolvedA));

  const resolvedB = await resolveTenantIdForUser(userBId);
  check("resolveTenantIdForUser(B) returns B's tenant", resolvedB === tenantBId, String(resolvedB));
}

// ─── 3. HTTP server-fn: forged session cookie ────────────────────────
async function testHttp(campaignA: string, campaignB: string) {
  console.log("\n[3] HTTP dbQueryProxy — forged session (claim says B, DB says A)");

  // User A's session, but the JWT claim lies: tenantId = tenant B.
  const forgedToken = await createSession(userAId, emailA, tenantBId);

  const chainForB = {
    table: "campaigns",
    op: "select",
    selectTokens: ["*"],
    joins: [],
    where: [{ sql: "id = ?", args: [campaignB] }],
    orderBy: null,
    limit: 1,
    insertData: null,
    updateData: null,
    onConflictCols: [],
  };
  const cross = await callProxy(chainForB, forgedToken);
  console.log(`    (status for B query: ${cross.status})`);
  check("A querying B's campaign via proxy returns nothing", !cross.data, JSON.stringify(cross));

  const chainForA = {
    table: "campaigns",
    op: "select",
    selectTokens: ["*"],
    joins: [],
    where: [{ sql: "id = ?", args: [campaignA] }],
    orderBy: null,
    limit: 1,
    insertData: null,
    updateData: null,
    onConflictCols: [],
  };
  const own = await callProxy(chainForA, forgedToken);
  console.log(`    (status for A query: ${own.status})`);
  check("A querying its own campaign via proxy still works", Boolean(own.data), JSON.stringify(own));

  // List: forged session listing campaigns must not include B's.
  const chainList = {
    table: "campaigns",
    op: "select",
    selectTokens: ["id", "name"],
    joins: [],
    where: [],
    orderBy: { sql: "ORDER BY created_at ASC", args: [] },
    limit: null,
    insertData: null,
    updateData: null,
    onConflictCols: [],
  };
  const list = await callProxy(chainList, forgedToken);
  const ids = (list.data ?? []).map((row: any) => row.id as string);
  check(
    "A's proxy campaign list excludes B's campaign",
    !ids.includes(campaignB) && ids.includes(campaignA),
    `ids: ${JSON.stringify(ids)}`,
  );
}

// ─── Run ──────────────────────────────────────────────────────────────
const started = Date.now();
const { campaignA, campaignB } = await setup();
try {
  await testDbLayer(campaignA, campaignB);
  await testResolution();
  await testHttp(campaignA, campaignB);
} finally {
  await teardown();
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s) in ${Date.now() - started}ms`);
process.exit(failures === 0 ? 0 : 1);
