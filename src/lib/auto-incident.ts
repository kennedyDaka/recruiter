/**
 * Auto-incident reporting — called from anywhere in the server code when
 * something fails (email delivery, payment, application submission, etc.).
 * Creates an incident in the database so the Contact Center picks it up.
 */

import { dbQueryFirst } from "@/lib/db";

interface ReportIncidentOpts {
  title: string;
  description?: string;
  source?: "auto_detected" | "system_monitoring";
  priority?: "critical" | "high" | "normal" | "low";
  category?: "recruitment" | "communication" | "account" | "billing" | "integrations" | "documents" | "other";
  errorType?: string;
  errorMessage?: string;
  tenantId?: string;
  campaignId?: string;
  candidateId?: string;
  action?: string;
  channel?: string;
}

/**
 * Reports an incident to the Contact Center.
 * Fire-and-forget: never throws, always logs to console.
 */
export async function reportIncident(opts: ReportIncidentOpts): Promise<string | null> {
  try {
    const now = new Date().toISOString();
    const slaHours = { critical: 4, high: 8, normal: 24, low: 48 };
    const slaResolution = new Date(
      Date.now() + (slaHours[opts.priority ?? "normal"] ?? 24) * 3600000,
    ).toISOString();

    // Get next incident number
    const last = await dbQueryFirst(
      "SELECT incident_number FROM incidents ORDER BY incident_number DESC LIMIT 1",
    );
    const nextNumber = ((last?.incident_number as number) ?? 0) + 1;

    const result = await dbQueryFirst(
      `INSERT INTO incidents (
        incident_number, tenant_id, source, priority, status, issue_type, category,
        title, description, error_type, error_message, action, channel,
        campaign_id, candidate_id, reported_by, reporter_name, reporter_email,
        sla_response_deadline, sla_resolution_deadline, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'open', $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, 'system', 'System Auto-Detect', 'system@operonrecruit.com',
        $15, $16, NOW(), NOW()
      ) RETURNING id, incident_number`,
      [
        nextNumber,
        opts.tenantId ?? null,
        opts.source ?? "auto_detected",
        opts.priority ?? "normal",
        opts.category ?? "other",
        opts.title,
        opts.description ?? null,
        opts.errorType ?? null,
        opts.errorMessage ?? null,
        opts.action ?? null,
        opts.channel ?? null,
        opts.campaignId ?? null,
        opts.candidateId ?? null,
        slaResolution,
        slaResolution,
      ],
    );

    console.log(`[Incident #${nextNumber}] ${opts.title}`);
    return result?.id ?? null;
  } catch (e: any) {
    console.error("[reportIncident] Failed:", e?.message);
    return null;
  }
}
