/**
 * Email dispatch — turns `communications` rows (status "queued") into real
 * sends. Shared by the BullMQ worker and the Redis-free inline flush path so
 * automatic emails go out even without a running worker process.
 */

import { sendEmail, type EmailProviderConfig } from "@/lib/email-provider";
import {
  emailConfigFromSettings,
  parseTenantSettings,
} from "@/lib/tenant-settings";

type Row = Record<string, unknown>;

/** Loads the tenant's email config (SMTP/Resend) from tenants.settings. */
async function tenantEmailConfig(
  tenantId: string,
  supabase: any,
): Promise<Partial<EmailProviderConfig> | null> {
  const res = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (res.error) return null;
  const settings = parseTenantSettings(
    (res.data as { settings?: unknown } | null)?.settings,
  );
  return emailConfigFromSettings(settings);
}

/**
 * Sends one queued communication and marks it sent/failed. Returns true when
 * the row was handled (sent, failed, or skipped for a missing recipient).
 * WhatsApp rows (channel "whatsapp") are dispatched through the Cloud API
 * with the phone number as recipient and no subject line.
 */
export async function dispatchCommunication(
  row: Row,
  supabase: any,
): Promise<{ sent: boolean; error?: string }> {
  const id = row["id"] as string;
  const recipient = row["recipient"] as string | null;
  const subject = row["subject"] as string | null;
  const body = row["body"] as string | null;
  const tenantId = row["tenant_id"] as string;
  const channel = row["channel"] === "whatsapp" ? "whatsapp" : "email";

  if (!id) return { sent: false };

  if (channel === "whatsapp") {
    if (!recipient || !body) {
      await supabase
        .from("communications")
        .update({ status: "failed", error: "Missing phone number or message body" })
        .eq("id", id);
      await autoIncident(tenantId, "WhatsApp delivery failed", "WHATSAPP_MISSING_RECIPIENT", "Missing phone number or message body", "Send candidate message", "whatsapp");
      return { sent: false, error: "Missing phone number or message body" };
    }
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp-provider");
    const result = await sendWhatsAppMessage({ to: recipient, text: body });
    if (result.ok) {
      await supabase
        .from("communications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id);
      return { sent: true };
    }
    await supabase
      .from("communications")
      .update({ status: "failed", error: result.error ?? "WhatsApp send failed" })
      .eq("id", id);
    await autoIncident(tenantId, "WhatsApp message failed", "WHATSAPP_SEND_FAILED", result.error || "WhatsApp send failed", "Send candidate message", "whatsapp");
    return result.error ? { sent: false, error: result.error } : { sent: false };
  }

  if (!recipient || !subject || !body) {
    await supabase
      .from("communications")
      .update({ status: "failed", error: "Missing recipient, subject or body" })
      .eq("id", id);
    return { sent: false, error: "Missing recipient, subject or body" };
  }

  const finish = (
    sent: boolean,
    error?: string,
  ): { sent: boolean; error?: string } => {
    const result: { sent: boolean; error?: string } = { sent };
    if (error) result.error = error;
    return result;
  };

  const tenantConfig = await tenantEmailConfig(tenantId, supabase);

  // Use pre-rendered HTML body when stored with the communication.
  const htmlBody = (row["html_body"] as string) || undefined;

  const emailInput: import("@/lib/email-provider").SendEmailInput = {
    to: recipient,
    subject,
    text: body,
  };
  if (htmlBody) emailInput.html = htmlBody;

  const result = await sendEmail(emailInput, tenantConfig);

  if (result.ok) {
    await supabase
      .from("communications")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id);
    return finish(true);
  }

  await supabase
    .from("communications")
    .update({ status: "failed", error: result.error ?? "Send failed" })
    .eq("id", id);
  await autoIncident(tenantId, "Email delivery failed", "EMAIL_SEND_FAILED", result.error || "Send failed", "Send candidate email", "email");
  return finish(false, result.error);
}

/**
 * Redis-free flush: processes every "queued" email for the tenant inline.
 * Returns the counts so callers can toast "N emails sent".
 */
export async function flushQueuedCommunications(supabase: any, tenantId?: string) {
  let query = supabase
    .from("communications")
    .select("*")
    .eq("status", "queued");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  query = query.order("created_at").limit(50);

  const res = await query;
  if (res.error) throw new Error(res.error.message);

  let sent = 0;
  let failed = 0;
  for (const row of res.data ?? []) {
    const outcome = await dispatchCommunication(row, supabase);
    if (outcome.sent) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/**
 * Auto-create an incident when a communication fails. Wraps the incident
 * creation in a try/catch so a failure here never blocks the dispatch flow.
 */
async function autoIncident(
  tenantId: string,
  title: string,
  errorType: string,
  errorMessage: string,
  action: string,
  channel: string,
) {
  try {
    const { autoCreateIncident } = await import("@/lib/incident.functions");
    // We can't call createServerFn from here directly, so we use the
    // underlying autoCreateIncident helper which works outside server fn context.
    const supabase = await import("@/lib/supabase.server").then((m) => m.getSupabaseClient());
    const now = new Date().toISOString();

    const { data: lastIncident } = await supabase
      .from("incidents" as any)
      .select("incident_number")
      .order("incident_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = ((lastIncident as any)?.incident_number || 0) + 1;
    const priority = "normal";
    const slaResponse = new Date(Date.now() + 2 * 3600000).toISOString();
    const slaResolution = new Date(Date.now() + 24 * 3600000).toISOString();

    await supabase.from("incidents" as any).insert({
      tenant_id: tenantId,
      incident_number: nextNumber,
      source: "auto_detected",
      priority,
      status: "detected",
      issue_type: "technical",
      category: "communication",
      title,
      error_type: errorType,
      error_message: errorMessage?.slice(0, 1000) || null,
      action,
      channel,
      reported_by: "00000000-0000-0000-0000-000000000000",
      reporter_name: "System",
      sla_response_deadline: slaResponse,
      sla_resolution_deadline: slaResolution,
      created_at: now,
      updated_at: now,
    } as any);
  } catch (err) {
    console.error("[autoIncident] Failed to create incident:", err);
  }
}
