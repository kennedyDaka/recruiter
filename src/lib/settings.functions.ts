import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  defaultTenantSettings,
  parseTenantSettings,
  serialiseTenantSettings,
  type AutoPipelineSettings,
  type DistributionSettings,
  type EmailSettings,
  type EmailTemplateOverrides,
} from "@/lib/tenant-settings";

const updateSchema = z.object({
  autoPipeline: z
    .object({
      enabled: z.boolean().optional(),
      shortlistMin: z.number().int().min(1).max(100).optional(),
      reviewMin: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
  email: z
    .object({
      from: z.string().trim().max(255).optional(),
      fromName: z.string().trim().max(120).optional(),
      verifyEmails: z.boolean().optional(),
    })
    .optional(),
  emailTemplates: z
    .record(
      z.string().max(60),
      z
        .object({
          subject: z.string().trim().max(200),
          body: z.string().trim().max(20000),
        })
        .nullable(),
    )
    .optional(),
  whatsapp: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  distribution: z
    .object({
      googleJobs: z.boolean().optional(),
      jobFeed: z.boolean().optional(),
      linkedin: z.boolean().optional(),
    })
    .optional(),
});

/** Reads the current tenant's settings (auto-pipeline toggle etc.). */
export const getTenantSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    const res = await supabaseAdmin
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);

    const settings = parseTenantSettings(
      (res.data as { settings?: unknown } | null)?.settings,
    );
    return {
      autoPipeline: settings.autoPipeline,
      email: settings.email,
      emailTemplates: settings.emailTemplates,
      whatsapp: settings.whatsapp,
      distribution: settings.distribution,
    };
  });

/** Merges partial updates into the tenant's stored settings. */
export const updateTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = context.tenantId;
    if (!tenantId) throw new Error("No workspace is linked to this account yet.");

    const res = await supabaseAdmin
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);

    const current = parseTenantSettings(
      (res.data as { settings?: unknown } | null)?.settings,
    );

    const emailTemplates: EmailTemplateOverrides = { ...current.emailTemplates };
    if (data.emailTemplates) {
      for (const [key, value] of Object.entries(data.emailTemplates)) {
        if (value === null) delete emailTemplates[key];
        else emailTemplates[key] = { subject: value.subject, body: value.body };
      }
    }

    const distribution: DistributionSettings = {
      googleJobs:
        data.distribution?.googleJobs ?? current.distribution.googleJobs,
      jobFeed: data.distribution?.jobFeed ?? current.distribution.jobFeed,
      linkedin: data.distribution?.linkedin ?? current.distribution.linkedin,
    };

    const merged: AutoPipelineSettings = {
      enabled:
        data.autoPipeline?.enabled ?? current.autoPipeline.enabled,
      shortlistMin:
        data.autoPipeline?.shortlistMin ?? current.autoPipeline.shortlistMin,
      reviewMin:
        data.autoPipeline?.reviewMin ?? current.autoPipeline.reviewMin,
    };
    // Keep the review threshold below the shortlist threshold.
    if (merged.reviewMin > merged.shortlistMin)
      merged.reviewMin = merged.shortlistMin;

    const email: EmailSettings = {
      from: data.email?.from ?? current.email.from,
      fromName: data.email?.fromName ?? current.email.fromName,
      verifyEmails: data.email?.verifyEmails ?? current.email.verifyEmails,
    };

    const whatsapp = {
      enabled: data.whatsapp?.enabled ?? current.whatsapp.enabled,
    };

    const updated = await supabaseAdmin
      .from("tenants")
      .update({
        settings: serialiseTenantSettings({
          autoPipeline: merged,
          email,
          emailTemplates,
          whatsapp,
          distribution,
        }),
      })
      .eq("id", tenantId);
    if (updated.error) throw new Error(updated.error.message);

    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_id: context.userId,
      action: "settings.updated",
      entity: "tenants",
      entity_id: tenantId,
    });

    return {
      autoPipeline: merged,
      email,
      emailTemplates,
      whatsapp,
      distribution,
      tenantId,
    };
  });

/** Convenience used at registration: builds settings JSON for a fresh tenant. */
export function settingsJsonForRegistration(input: {
  autoPipelineEnabled?: boolean;
}): string | null {
  if (!input.autoPipelineEnabled) return null;
  const settings = defaultTenantSettings();
  settings.autoPipeline.enabled = true;
  return serialiseTenantSettings(settings);
}
