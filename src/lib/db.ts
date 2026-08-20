/**
 * Database layer — PostgreSQL (Neon) + query builder.
 * Translates .from("table").select().eq(). chains into real SQL.
 */

let _pool: any = null;

async function getPool() {
  if (!_pool) {
    if (typeof window !== "undefined") throw new Error("Cannot use DB pool in browser");
    const pg = await import("pg");
    const connStr = process.env["DATABASE_URL"];
    if (!connStr) throw new Error("DATABASE_URL is not set");
    _pool = new pg.Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _pool;
}

/** Convert ?-style placeholders to $1,$2,... for PostgreSQL */
function toPgPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

/** Serialize Date objects to ISO strings so React can render them. */
function serializeDates(rows: any[]): any[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
    return out;
  });
}

export async function dbQuery(sql: string, args?: any[]) {
  const pool = await getPool();
  const pgSql = toPgPlaceholders(sql);
  const result = await pool.query(pgSql, args ?? []);
  return result.rows;
}

export async function dbQueryFirst(sql: string, args?: any[]) {
  const rows = await dbQuery(sql, args);
  return rows[0] ?? null;
}

export async function dbExecute(sql: string, args?: any[]) {
  const pool = await getPool();
  const pgSql = toPgPlaceholders(sql);
  return pool.query(pgSql, args ?? []);
}

// ─── Query Builder (Supabase .from() API compatible) ────────────────

type SqlPart = { sql: string; args: any[] };

type JoinSpec = {
  table: string;
  cols: string[] | null;
  on: string;
};

function merge(parts: SqlPart[], separator = " "): SqlPart {
  return {
    sql: parts.map((p) => p.sql).join(separator),
    args: parts.flatMap((p) => p.args),
  };
}

/** FK mappings for the app's `table(cols)` sub-relation selects. */
const RELATION_JOINS: Record<string, string> = {
  candidates: "applications.candidate_id = candidates.id",
  campaigns: "applications.campaign_id = campaigns.id",
  campaign_answer_options:
    "campaign_answer_options.question_id = campaign_questions.id",
  plans: "subscriptions.plan_id = plans.id",
  tenants: "campaigns.tenant_id = tenants.id",
};

function qualifyWhereFragment(part: SqlPart, table: string): SqlPart {
  const sql = part.sql.replace(
    /^(\w+)(\s+(?:IN|IS)\b|\s*[=!<>]+|$)/i,
    (_match, col: string, rest: string) => {
      if (/^\d/.test(col)) return part.sql;
      return `${table}.${col}${rest}`;
    },
  );
  return { sql, args: part.args };
}

function splitSelectCols(cols: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of cols) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

class QueryBuilder {
  private _table: string;
  private _op: "select" | "insert" | "update" | "delete" | "upsert" =
    "select";
  private _selectTokens: string[] = ["*"];
  private _joins: JoinSpec[] = [];
  private _where: SqlPart[] = [];
  private _orderBy: SqlPart | null = null;
  private _limit: number | null = null;
  private _insertData: any = null;
  private _updateData: any = null;
  private _onConflictCols: string[] = [];
  __tenantScope: string | null = null;

  constructor(table: string) {
    this._table = table;
  }

  select(cols?: string): this {
    this._op = "select";
    const tokens = splitSelectCols(cols ?? "*");
    this._selectTokens = [];
    this._joins = [];
    for (const token of tokens) {
      if (!token) continue;
      const match = token.match(/^(\w+)\((\*|[^)]*)\)$/);
      if (match) {
        const table = match[1]!;
        const inner = match[2]!.trim();
        const cols =
          inner === "*"
            ? null
            : inner
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean);
        this._joins.push({
          table,
          cols,
          on:
            RELATION_JOINS[table] ??
            `${this._table}.${table.replace(/s$/, "")}_id = ${table}.id`,
        });
        continue;
      }
      this._selectTokens.push(token);
    }
    if (this._selectTokens.length === 0) this._selectTokens = ["*"];
    return this;
  }

  eq(col: string, val: unknown): this {
    if (val === null)
      this._where.push({ sql: `${col} IS NULL`, args: [] });
    else this._where.push({ sql: `${col} = ?`, args: [val] });
    return this;
  }

  neq(col: string, val: unknown): this {
    this._where.push({ sql: `${col} != ?`, args: [val] });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    if (vals.length === 0) {
      this._where.push({ sql: "1 = 0", args: [] });
      return this;
    }
    const ph = vals.map(() => "?").join(", ");
    this._where.push({ sql: `${col} IN (${ph})`, args: vals });
    return this;
  }

  is(col: string, val: unknown): this {
    this._where.push({
      sql: val === null ? `${col} IS NULL` : `${col} IS NOT NULL`,
      args: [],
    });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    const dir = opts?.ascending !== false ? "ASC" : "DESC";
    this._orderBy = { sql: `ORDER BY ${col} ${dir}`, args: [] };
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  single() {
    this._limit = 1;
    return this._exec();
  }
  maybeSingle() {
    this._limit = 1;
    return this._exec();
  }

  private _pendingInsert: any = null;
  private _pendingUpdate: any = null;

  private _columnCache = new Map<string, string[]>();

  private async _getColumns(table: string): Promise<string[]> {
    if (!this._columnCache.has(table)) {
      const rows = await dbQuery(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [table],
      );
      this._columnCache.set(
        table,
        rows.map((row: any) => row.column_name as string),
      );
    }
    return this._columnCache.get(table)!;
  }

  private async _hasIdColumn(): Promise<boolean> {
    return (await this._getColumns(this._table)).includes("id");
  }

  private async _ensureId(row: Record<string, unknown>) {
    if (row["id"] === undefined && (await this._hasIdColumn()))
      row["id"] = crypto.randomUUID();
  }

  private async _ensureUpdatedAt(row: Record<string, unknown>) {
    const columns = await this._getColumns(this._table);
    if (columns.includes("updated_at") && row["updated_at"] === undefined) {
      row["updated_at"] = new Date().toISOString();
    }
  }

  private _bindValue(value: unknown) {
    if (value === undefined) return null;
    if (value === null) return value;
    if (typeof value === "object" && !(value instanceof ArrayBuffer)) {
      return JSON.stringify(value);
    }
    return value;
  }

  insert(data: any): this {
    this._op = "insert";
    this._insertData = data;
    this._pendingInsert = data;
    return this;
  }

  update(data: any): this {
    this._op = "update";
    this._updateData = data;
    this._pendingUpdate = data;
    return this;
  }
  upsert(data: any, opts?: { onConflict?: string }): this {
    this._op = "upsert";
    this._insertData = data;
    if (opts?.onConflict)
      this._onConflictCols = opts.onConflict
        .split(",")
        .map((c) => c.trim());
    return this;
  }
  delete(): this {
    this._op = "delete";
    return this;
  }

  then(
    onfulfilled?: (value: any) => any,
    onrejected?: (reason: any) => any,
  ): Promise<any> {
    return this._exec().then(onfulfilled, onrejected);
  }

  private async _buildWhere(): Promise<SqlPart> {
    const parts = [...this._where];
    if (this.__tenantScope) {
      const { TENANT_SCOPED_TABLES } = await import("@/lib/tenant-guard");
      if (TENANT_SCOPED_TABLES.has(this._table)) {
        const alreadyScoped = parts.some((part) =>
          part.sql.includes("tenant_id"),
        );
        if (!alreadyScoped) {
          parts.push({ sql: "tenant_id = ?", args: [this.__tenantScope] });
        }
      }
    }
    if (parts.length === 0) return { sql: "", args: [] };
    return merge(
      [{ sql: "WHERE", args: [] }, merge(parts, " AND ")],
    );
  }

  async _exec(): Promise<{
    data: any;
    error: { message: string; code?: string } | null;
  }> {
    if (typeof window !== "undefined") {
      return this._execRemote();
    }
    try {
      if (this._op === "select" && this._pendingInsert) {
        const insertResult = await this._doInsert(this._pendingInsert);
        if (insertResult.error) return insertResult;
        const insertedId =
          this._pendingInsert.id ?? insertResult.data?.id;
        this._pendingInsert = null;
        if (insertedId) {
          this._where = [{ sql: "id = ?", args: [insertedId] }];
          return this._doSelect();
        }
        return { data: insertResult.data, error: null };
      }

      if (this._op === "select" && this._pendingUpdate) {
        const updateResult = await this._doUpdate();
        if (updateResult.error) return updateResult;
        this._pendingUpdate = null;
        return this._doSelect();
      }

      switch (this._op) {
        case "select":
          return this._doSelect();
        case "insert":
          return this._doInsert(this._insertData);
        case "update":
          return this._doUpdate();
        case "upsert":
          return this._doUpsert();
        case "delete":
          return this._doDelete();
        default:
          return { data: null, error: { message: "Unknown op" } };
      }
    } catch (e: any) {
      return {
        data: null,
        error: { message: e.message || String(e) },
      };
    }
  }

  private async _execRemote(): Promise<{
    data: any;
    error: { message: string } | null;
  }> {
    try {
      const { dbQueryProxy } = await import("@/lib/db-proxy.functions");
      const result = await dbQueryProxy({
        data: {
          table: this._table,
          op: this._op,
          selectTokens: this._selectTokens,
          joins: this._joins,
          where: this._where,
          orderBy: this._orderBy,
          limit: this._limit,
          insertData: this._insertData,
          updateData: this._updateData,
          onConflictCols: this._onConflictCols,
        },
      });
      const r = result as { data: any; error: { message: string } | null };
      if (r.data && Array.isArray(r.data)) r.data = serializeDates(r.data);
      return r;
    } catch (e: any) {
      return { data: null, error: { message: e.message || String(e) } };
    }
  }

  private async _doSelect() {
    const joined = this._joins.length > 0;
    const qualify = (token: string) =>
      token === "*" ? `${this._table}.*` : `${this._table}.${token}`;
    const selectFragments = this._selectTokens.map((token) =>
      joined ? qualify(token) : token,
    );
    const scoped = [...this._where];
    if (this.__tenantScope) {
      const { TENANT_SCOPED_TABLES } = await import("@/lib/tenant-guard");
      if (TENANT_SCOPED_TABLES.has(this._table)) {
        const alreadyScoped = scoped.some((part) =>
          part.sql.includes("tenant_id"),
        );
        if (!alreadyScoped) {
          scoped.push({
            sql: "tenant_id = ?",
            args: [this.__tenantScope],
          });
        }
      }
    }
    const whereParts = joined
      ? scoped.map((p) => qualifyWhereFragment(p, this._table))
      : scoped;
    const where =
      whereParts.length === 0
        ? { sql: "", args: [] }
        : merge([
            { sql: "WHERE", args: [] },
            merge(whereParts, " AND "),
          ]);
    const orderBy =
      joined && this._orderBy
        ? {
            sql: this._orderBy.sql.replace(
              /^ORDER BY (\w+)( ASC| DESC)?$/,
              `ORDER BY ${this._table}.$1$2`,
            ),
            args: this._orderBy.args,
          }
        : this._orderBy;
    const parts: SqlPart[] = [];
    for (const join of this._joins) {
      const cols =
        join.cols ?? (await this._getColumns(join.table));
      for (const col of cols) {
        selectFragments.push(
          `${join.table}.${col} AS "${join.table}.${col}"`,
        );
      }
      parts.push({
        sql: `LEFT JOIN ${join.table} ON ${join.on}`,
        args: [],
      });
    }
    parts.unshift({
      sql: `SELECT ${selectFragments.join(", ")} FROM ${this._table}`,
      args: [],
    });
    parts.push(where);
    if (orderBy) parts.push(orderBy);
    if (this._limit !== null)
      parts.push({ sql: "LIMIT ?", args: [this._limit] });
    const merged = merge(parts);
    // Convert ? placeholders to $1,$2,... for PostgreSQL
    const pgSql = toPgPlaceholders(merged.sql);
    const rows = await dbQuery(pgSql, merged.args);
    const nested = this._nestRelationRows(serializeDates(rows));
    return {
      data: this._limit === 1 ? (nested[0] ?? null) : nested,
      error: null,
    };
  }

  private _nestRelationRows(rows: any[]): any[] {
    if (this._joins.length === 0 || rows.length === 0) return rows;
    const relations = this._joins.map((j) => j.table);
    const grouped: any[] = [];
    const index = new Map<string, any>();
    for (const row of rows) {
      const parent: Record<string, unknown> = {};
      const relValues: Record<
        string,
        Record<string, unknown>
      > = {};
      for (const key of Object.keys(row)) {
        const dot = key.indexOf(".");
        if (dot === -1) {
          parent[key] = row[key];
        } else {
          const table = key.slice(0, dot);
          const col = key.slice(dot + 1);
          (relValues[table] ??= {})[col] = row[key];
        }
      }
      const idKey = parent["id"];
      const key =
        idKey === undefined
          ? JSON.stringify(parent)
          : String(idKey);
      let entry = index.get(key);
      if (!entry) {
        entry = { parent, relations: {} };
        index.set(key, entry);
        grouped.push(entry);
      }
      for (const table of relations) {
        const value = relValues[table];
        if (!value) continue;
        const allNull = Object.values(value).every(
          (v) => v === null || v === undefined,
        );
        if (allNull) continue;
        (entry.relations[table] ??= []).push(value);
      }
    }
    return grouped.map((entry) => {
      const out = { ...entry.parent };
      for (const table of relations) {
        const values = entry.relations[table] ?? [];
        out[table] = values.length === 1 ? values[0] : values;
      }
      return out;
    });
  }

  private async _doInsert(data: any) {
    if (Array.isArray(data)) {
      const results = [];
      for (const row of data) {
        await this._ensureId(row);
        await this._ensureUpdatedAt(row);
        if (this.__tenantScope)
          row["tenant_id"] = this.__tenantScope;
        const cols = Object.keys(row);
        const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
        await dbExecute(
          `INSERT INTO ${this._table} (${cols.join(", ")}) VALUES (${ph})`,
          cols.map((c) => this._bindValue(row[c])),
        );
      }
      return { data: null, error: null };
    }
    await this._ensureId(data);
    await this._ensureUpdatedAt(data);
    if (this.__tenantScope)
      data["tenant_id"] = this.__tenantScope;
    const cols = Object.keys(data);
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    const res = await dbExecute(
      `INSERT INTO ${this._table} (${cols.join(", ")}) VALUES (${ph}) RETURNING *`,
      cols.map((c) => this._bindValue(data[c])),
    );
    const row = res.rows?.[0] ?? null;
    return { data: row ?? { id: data.id }, error: null };
  }

  private async _doUpdate() {
    const where = await this._buildWhere();
    if (where.sql === "") {
      return {
        data: null,
        error: {
          message: "Refusing unscoped update on tenant table.",
        },
      };
    }
    await this._ensureUpdatedAt(this._updateData);
    const cols = Object.keys(this._updateData);
    const setSql = cols
      .map((c, i) => `${c} = $${i + 1}`)
      .join(", ");
    const vals = cols.map((c) => this._bindValue(this._updateData[c]));
    // Merge where args after set args
    const mergedWhere = merge([{ sql: "", args: vals }, where]);
    const pgSql = toPgPlaceholders(
      `UPDATE ${this._table} SET ${setSql}${where.sql ? " " + where.sql : ""}`,
    );
    // Build proper $N params: set params first, then where params
    let paramIdx = 0;
    const allArgs = [
      ...cols.map((c) => this._bindValue(this._updateData[c])),
      ...where.args,
    ];
    const pgSqlFinal = `UPDATE ${this._table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}${where.sql ? " " + toPgPlaceholders(where.sql) : ""}`;
    // Rebuild $N numbering for where clause
    let finalSql = `UPDATE ${this._table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}`;
    if (where.sql) {
      let idx = cols.length;
      const pgWhere = where.sql.replace(/\?/g, () => `$${++idx}`);
      finalSql += ` ${pgWhere}`;
    }
    const res = await dbExecute(finalSql, allArgs);
    const affected = res.rowCount ?? 0;
    return {
      data: affected > 0 ? { count: affected } : null,
      error: null,
    };
  }

  private async _doUpsert() {
    const data = this._insertData;
    await this._ensureId(data);
    await this._ensureUpdatedAt(data);
    if (this.__tenantScope)
      data["tenant_id"] = this.__tenantScope;
    const cols = Object.keys(data);
    const vals = cols.map((c) => this._bindValue(data[c]));
    const updateCols = cols.filter((c) => c !== "id");
    const setSql = updateCols
      .map((c, i) => `${c} = $${i + 1}`)
      .join(", ");
    const conflict =
      this._onConflictCols.length > 0
        ? `(${this._onConflictCols.join(", ")})`
        : cols.includes("id")
          ? "(id)"
          : "";
    // Build ON CONFLICT UPDATE with proper $N params
    // Params: $1..$N for INSERT, then $N+1.. for UPDATE SET
    const insertParams = cols
      .map((_, i) => `$${i + 1}`)
      .join(", ");
    let paramIdx = cols.length;
    const updateParams = updateCols
      .map((c) => `$${++paramIdx}`)
      .join(", ");
    const setClause = updateCols
      .map(
        (c, i) =>
          `${c} = $${cols.length + i + 1}`,
      )
      .join(", ");
    const allArgs = [
      ...vals,
      ...updateCols.map((c) => this._bindValue(data[c])),
    ];
    const finalSql = `INSERT INTO ${this._table} (${cols.join(", ")}) VALUES (${insertParams}) ON CONFLICT ${conflict} DO UPDATE SET ${setClause}`;
    await dbExecute(finalSql, allArgs);
    return { data: null, error: null };
  }

  private async _doDelete() {
    const where = await this._buildWhere();
    if (where.sql === "") {
      return {
        data: null,
        error: {
          message: "Refusing unscoped delete on tenant table.",
        },
      };
    }
    const pgWhere = toPgPlaceholders(where.sql);
    await dbExecute(
      `DELETE FROM ${this._table} ${pgWhere}`,
      where.args,
    );
    return { data: null, error: null };
  }
}

export function from(table: string): QueryBuilder {
  return new QueryBuilder(table);
}
