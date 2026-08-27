import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  companyName: z.string().trim().min(2).max(120),
  industry: z.string().trim().max(80).optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
  region: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  currency: z.string().trim().max(10).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().max(255),
  website: z.string().trim().max(255).optional().default(""),
  logoUrl: z.string().trim().max(500).optional().default(""),
  logoData: z.string().max(10_000_000).optional().default(""),
  brandColor: z.string().max(7).optional().default("#2563eb"),
  brandFont: z.string().max(50).optional().default("Inter"),
  fullName: z.string().trim().min(2).max(120),
  adminPhone: z.string().trim().max(40).optional().default(""),
  autoPipelineEnabled: z.boolean().optional().default(false),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Creates the company workspace for the currently signed-in administrator. */
export const registerCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { createSession } = await import("@/lib/auth/session");
    const { setSessionCookieServer } = await import("@/lib/auth/session.server");

    const existing = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (existing.data?.tenant_id) {
      // Refresh the session so the client-side workspace gate sees the tenant.
      const token = await createSession({
        userId,
        email: data.email,
        tenantId: existing.data.tenant_id as string,
      });
      await setSessionCookieServer(token);
      return { tenantId: existing.data.tenant_id as string, created: false, token };
    }

    let slug = slugify(data.companyName) || "company";
    const taken = await supabaseAdmin.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (taken.data) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const { settingsJsonForRegistration } = await import("@/lib/settings.functions");
    const settings = settingsJsonForRegistration({
      autoPipelineEnabled: data.autoPipelineEnabled,
    });

    const tenant = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.companyName,
        slug,
        industry: data.industry || null,
        country: data.country || null,
        region: data.region || null,
        city: data.city || null,
        currency: data.currency || null,
        phone: data.phone || null,
        email: data.email,
        website: data.website || null,
        logo_url: data.logoUrl || null,
        logo_data: data.logoData || null,
        brand_color: data.brandColor || "#2563eb",
        brand_font: data.brandFont || "Inter",
        settings: settings,
      })
      .select("id")
      .single();
    if (tenant.error) throw new Error(tenant.error.message);
    if (!tenant.data?.id) throw new Error("Could not create the company workspace. Please try again.");

    const tenantId = tenant.data.id as string;

    const profile = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      tenant_id: tenantId,
      full_name: data.fullName,
      email: data.email,
      phone: data.adminPhone || null,
    });
    if (profile.error) throw new Error(profile.error.message);

    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, tenant_id: tenantId, role: "company_admin" },
        { onConflict: "user_id,role" },
      );

    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_id: userId,
      action: "company.registered",
      entity: "tenants",
      entity_id: tenantId,
    });

    // Re-issue the session with the new tenant so the client gate lets the
    // user into /dashboard instead of redirecting back to onboarding.
    const token = await createSession({ userId, email: data.email, tenantId });
    await setSessionCookieServer(token);

    return { tenantId, created: true, token };
  });
