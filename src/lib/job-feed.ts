/**
 * Public job feed — RSS 2.0 of every live campaign whose tenant opted into
 * the feed (default on). Served at /feeds/jobs.xml by src/server.ts and
 * consumed by Indeed, Workable, Glassdoor-style aggregators and job boards
 * that accept an RSS URL.
 */

import { parseTenantSettings } from "@/lib/tenant-settings";

type FeedRow = {
  id: string;
  job_title: string;
  job_description: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  published_at: string | null;
  closing_date: string | null;
  public_token: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  settings: string | null;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value: string): string {
  // Split on the CDATA terminator so untrusted text can never break out.
  return `<![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function renderJobFeed(origin: string): Promise<string> {
  const { dbQuery } = await import("@/lib/db");

  const rows = (await dbQuery(
    `SELECT c.id, c.job_title, c.job_description, c.location, c.employment_type,
            c.salary_min, c.salary_max, c.salary_currency,
            c.published_at, c.closing_date, c.public_token,
            t.name AS tenant_name, t.slug AS tenant_slug, t.settings
     FROM campaigns c
     JOIN tenants t ON t.id = c.tenant_id
     WHERE c.status = 'active'
     ORDER BY c.published_at DESC
     LIMIT 500`,
  )) as unknown as FeedRow[];

  const base = origin.replace(/\/+$/, "");
  const items: string[] = [];

  for (const row of rows) {
    // Tenant opt-out: the feed only carries roles the workspace chose to share.
    const settings = parseTenantSettings(row.settings);
    if (!settings.distribution.jobFeed) continue;

    const applyPath = row.public_token
      ? `/apply/${row.id}`
      : `/apply/${row.id}`;
    const link = `${base}${applyPath}`;
    const description =
      row.job_description?.trim() ||
      `${row.job_title} at ${row.tenant_name ?? "our company"}. Apply online.`;

    const pubDate = row.published_at
      ? new Date(row.published_at).toUTCString()
      : new Date().toUTCString();

    const closing = row.closing_date
      ? `<closingDate>${escapeXml(row.closing_date.slice(0, 10))}</closingDate>`
      : "";
    const salary =
      row.salary_min != null || row.salary_max != null
        ? `<salaryMin>${escapeXml(String(row.salary_min ?? ""))}</salaryMin><salaryMax>${escapeXml(String(row.salary_max ?? ""))}</salaryMax>`
        : "";

    items.push(`    <item>
      <title>${escapeXml(row.job_title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${cdata(description)}</description>
      <guid isPermaLink="false">${escapeXml(row.id)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <company>${escapeXml(row.tenant_name ?? "")}</company>
      <location>${escapeXml(row.location ?? "")}</location>
      <employmentType>${escapeXml(row.employment_type ?? "")}</employmentType>
      ${closing}${salary}
    </item>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RecruiterMW — live jobs</title>
    <link>${escapeXml(base)}</link>
    <description>Live recruitment campaigns published on RecruiterMW.</description>
${items.join("\n")}
  </channel>
</rss>
`;
}
