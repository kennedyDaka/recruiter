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

  const result = await sendEmail(
    { to: recipient, subject, text: body, html: htmlBody },
    tenantConfig,
  );

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
