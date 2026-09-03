import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { flushQueuedCommunications } from "@/lib/email-dispatch";
import {
  emailProviderConfigured,
  emailProviderStatus,
  resolveEmailConfig,
  sendEmail,
} from "@/lib/email-provider";
import {
  emailConfigFromSettings,
  parseTenantSettings,
} from "@/lib/tenant-settings";
import type { EmailTemplateKey } from "@/lib/email-templates";

/**
 * Scans the tenant's recent failed sends for a Resend "domain not verified"
 * error and turns it into an actionable warning for the Settings page.
 */
async function detectEmailWarning(
  supabase: any,
  tenantId: string,
): Promise<{
  type: "unverified_domain";
  domain: string;
  message: string;
} | null> {
  const res = await supabase
    .from("communications")
    .select("error")
    .eq("tenant_id", tenantId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(10);
  if (res.error) return null;
  for (const row of (res.data ?? []) as { error?: unknown }[]) {
    const message = String(row.error ?? "");
    const match = /The ([\w.-]+) domain is not verified/i.exec(message);
    if (match) {
      return {
        type: "unverified_domain",
        domain: match[1] ?? "",
        message:
          `Your sending domain ${match[1]} isn't verified in Resend yet, so emails can't be delivered. ` +
          `Add it at resend.com/domains and paste the DNS records it shows (SPF, DKIM, and the MX/` +
          `verification record) into your domain provider, then wait for verification to finish.`,
      };
    }
  }
  return null;
}

/**
 * Flushes queued emails inline (no Redis/worker needed). Returns counts so
 * the UI can confirm delivery. Idempotent — already-sent rows are untouched.
 */
export const flushEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = context.tenantId ?? undefined;
    return flushQueuedCommunications(supabaseAdmin, tenantId);
  });

const testSchema = z.object({
  to: z.string().trim().email().max(255),
});

/** Sends a test email through the tenant's configured provider. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => testSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    const tenantRes = await supabaseAdmin
      .from("tenants")
      .select("settings, name")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRes.error) throw new Error(tenantRes.error.message);

    const settings = parseTenantSettings(
      (tenantRes.data as { settings?: unknown } | null)?.settings,
    );
    const tenantConfig = emailConfigFromSettings(settings);

    const result = await sendEmail(
      {
        to: data.to,
        subject: "RecruiterMW — test email",
        text:
          "This is a test email from your RecruiterMW workspace.\n\n" +
          "If you received this, your email integration is working correctly.\n\n" +
          `— ${(tenantRes.data as { name?: string } | null)?.name ?? "RecruiterMW"}`,
      },
      tenantConfig,
    );

    if (!result.ok) throw new Error(result.error ?? "Email send failed.");
    return { messageId: result.messageId, provider: result.provider };
  });

/** Reports the active provider mode + whether credentials are configured. */
export const getEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    const tenantRes = await supabaseAdmin
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRes.error) throw new Error(tenantRes.error.message);

    const settings = parseTenantSettings(
      (tenantRes.data as { settings?: unknown } | null)?.settings,
    );
    const tenantConfig = emailConfigFromSettings(settings);
    const resolved = resolveEmailConfig(tenantConfig);
    const status = emailProviderStatus(resolved);
    const warning = await detectEmailWarning(supabaseAdmin, tenantId);

    return {
      mode: resolved.mode,
      configured: emailProviderConfigured(resolved),
      status: status.label,
      warning,
    };
  });

// ─── Bulk email verification & sending ───────────────────────────────

const bulkVerifySchema = z.object({
  // Lenient on purpose: format problems are reported per line as "invalid"
  // instead of failing the whole batch.
  emails: z.array(z.string().trim().max(255)).min(1).max(200),
});

/**
 * Automatically verifies a pasted list of candidate emails: free checks
 * (format, disposable domains, MX) always, plus the ZeroBounce deep check when
 * the platform has a key configured (results are cached 24h so re-checks of
 * the same address don't burn credits). No tenant setup involved.
 */
export const verifyEmailsBulkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => bulkVerifySchema.parse(input))
  .handler(async ({ data }) => {
    const { assessEmail } = await import("@/lib/email-verify");
    const results = [];
    for (const email of data.emails) {
      results.push(
        await assessEmail(email, {
          zeroBounceKey: process.env["ZEROBOUNCE_API_KEY"] || null,
        }),
      );
    }
    return { results };
  });

const bulkSendSchema = z.object({
  emails: z.array(z.string().trim().max(255)).min(1).max(200),
  // Optional real names per recipient (email → first name) so campaign emails
  // are personalised with the candidate's actual name, not one derived from
  // the address. Falls back to the address-derived name when absent.
  names: z.record(z.string().trim().max(255), z.string().trim().max(120)).optional(),
  template: z.enum([
    "application_received",
    "shortlisted",
    "interview_invitation",
    "rejected",
    "offer",
  ] satisfies EmailTemplateKey[] as [EmailTemplateKey, ...EmailTemplateKey[]]),
});

/**
 * Queues one templated email per pasted address (recruiter-initiated bulk
 * communication). Re-runs the free checks server-side so an unverified or
 * disposable address in the list is skipped, never emailed.
 */
export const sendBulkEmailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => bulkSendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenantRes = await supabaseAdmin
      .from("tenants")
      .select("name, settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRes.error) throw new Error(tenantRes.error.message);
    const settings = parseTenantSettings(
      (tenantRes.data as { settings?: unknown } | null)?.settings,
    );

    const { renderEmail, resolveEmailTemplate } = await import("@/lib/email-templates");
    const { assertEmailUsable } = await import("@/lib/email-verify");

    const rows = [];
    let skipped = 0;
    for (const email of data.emails) {
      try {
        await assertEmailUsable(email, { zeroBounceKey: null });
      } catch {
        skipped += 1;
        continue;
      }
      const source = resolveEmailTemplate(data.template, settings.emailTemplates);
      const firstName =
        data.names?.[email]?.trim() ||
        (email.split("@")[0] ?? "")
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim() ||
        "there";
      const rendered = renderEmail(source, {
        first_name: firstName,
        job_title: null,
        company: (tenantRes.data?.name as string | undefined) ?? null,
      });
      rows.push({
        tenant_id: tenantId,
        channel: "email",
        template: data.template,
        subject: rendered.subject,
        body: rendered.body,
        html_body: rendered.html,
        recipient: email,
        status: "queued",
      });
    }

    const inserted = await context.supabase.from("communications").insert(rows);
    if (inserted.error) throw new Error(inserted.error.message);

    // Best-effort immediate dispatch; failures stay queued for the worker/flush.
    try {
      const { flushQueuedCommunications } = await import("@/lib/email-dispatch");
      await flushQueuedCommunications(supabaseAdmin, tenantId);
    } catch {
      // Non-fatal.
    }

    return { queued: rows.length, skipped };
  });

const resendSchema = z.object({
  id: z.string().trim().min(1).max(255),
});

/**
 * Re-queues a failed/queued communication and tries to dispatch it again.
 * The row is only reachable when it belongs to the caller's tenant (the
 * tenant-scoped builder injects tenant_id, so a foreign id resolves to
 * "not found"). A sent email is refused — never double-delivered.
 */
export const resendCommunicationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const res = await context.supabase
      .from("communications")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);
    if (!res.data) throw new Error("Email not found.");
    if (res.data.status === "sent") throw new Error("This email was already delivered.");

    const updated = await context.supabase
      .from("communications")
      .update({ status: "queued", error: null, sent_at: null })
      .eq("id", data.id);
    if (updated.error) throw new Error(updated.error.message);

    const { flushQueuedCommunications } = await import("@/lib/email-dispatch");
    const outcome = await flushQueuedCommunications(supabaseAdmin, tenantId);
    return { requeued: true, sent: outcome.sent, failed: outcome.failed };
  });

/** Reports whether the platform WhatsApp Cloud API credentials are configured. */
export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { resolveWhatsAppConfig, whatsAppStatus } = await import(
      "@/lib/whatsapp-provider"
    );
    const status = whatsAppStatus(resolveWhatsAppConfig());
    return { configured: status.configured, status: status.label };
  });

const bulkWhatsAppSchema = z.object({
  recipients: z
    .array(
      z.object({
        phone: z.string().trim().min(1).max(40),
        name: z.string().trim().max(120),
      }),
    )
    .min(1)
    .max(200),
  template: z.enum([
    "application_received",
    "shortlisted",
    "interview_invitation",
    "rejected",
    "offer",
  ] satisfies EmailTemplateKey[] as [EmailTemplateKey, ...EmailTemplateKey[]]),
});

/**
 * Queues one templated WhatsApp message per phone number (candidates with no
 * email on file). Requires the workspace's WhatsApp opt-in (Settings); phone
 * numbers are normalized to international digits and unusable numbers are
 * skipped, never sent. Rows are channel "whatsapp", dispatched by the same
 * flush path as email.
 */
export const sendBulkWhatsAppFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => bulkWhatsAppSchema.parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenantRes = await context.supabase
      .from("tenants")
      .select("name, settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRes.error) throw new Error(tenantRes.error.message);
    const settings = parseTenantSettings(
      (tenantRes.data as { settings?: unknown } | null)?.settings,
    );
    if (!settings.whatsapp.enabled) {
      throw new Error("WhatsApp isn't enabled for this workspace — turn it on in Settings.");
    }

    const { renderEmail, resolveEmailTemplate } = await import("@/lib/email-templates");
    const { normalizeWhatsAppPhone } = await import("@/lib/whatsapp-provider");

    const rows = [];
    let skipped = 0;
    for (const { phone, name } of data.recipients) {
      const normalized = normalizeWhatsAppPhone(phone);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      const source = resolveEmailTemplate(data.template, settings.emailTemplates);
      const rendered = renderEmail(source, {
        first_name: name.split(" ")[0] || name,
        job_title: null,
        company: (tenantRes.data?.name as string | undefined) ?? null,
      });
      rows.push({
        tenant_id: tenantId,
        channel: "whatsapp",
        template: data.template,
        subject: null,
        body: rendered.body,
        recipient: normalized,
        status: "queued",
      });
    }

    const inserted = await context.supabase.from("communications").insert(rows);
    if (inserted.error) throw new Error(inserted.error.message);

    try {
      const { flushQueuedCommunications } = await import("@/lib/email-dispatch");
      await flushQueuedCommunications(supabaseAdmin, tenantId);
    } catch {
      // Non-fatal.
    }

    return { queued: rows.length, skipped };
  });
