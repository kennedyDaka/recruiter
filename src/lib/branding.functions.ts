import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fetch current tenant branding */
export const getTenantBrandingFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { dbQueryFirst } = await import("@/lib/db");
    if (!context.tenantId) return null;
    const row = await dbQueryFirst(
      `SELECT name, logo_data, logo_url, brand_color, brand_font FROM tenants WHERE id = $1`,
      [context.tenantId],
    );
    if (!row) return null;
    return {
      name: row.name,
      logoData: row.logo_data || row.logo_url || null,
      brandColor: row.brand_color || "#2563eb",
      brandFont: row.brand_font || "Inter",
    };
  });

/** Update tenant branding */
export const updateTenantBrandingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: unknown) =>
      z
        .object({
          logoData: z.string().max(10_000_000).optional(),
          brandColor: z.string().max(7).optional(),
          brandFont: z.string().max(50).optional(),
          companyName: z.string().min(2).max(120).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { dbExecute } = await import("@/lib/db");
    if (!context.tenantId) throw new Error("No workspace");

    const sets: string[] = [];
    const args: any[] = [];
    let idx = 1;

    if (data.logoData !== undefined) {
      // Upload to R2 if configured and data is a base64 data URL
      let logoUrl: string | null = null;
      let logoData: string | null = data.logoData || null;
      if (data.logoData && data.logoData.startsWith("data:")) {
        try {
          const { uploadLogoFn } = await import("@/lib/upload-logo.functions");
          const result = await uploadLogoFn({
            data: {
              base64DataUrl: data.logoData,
              tenantId: context.tenantId,
              fileName: "logo",
            },
          });
          if (result && typeof result === "object" && "url" in result) {
            const r = result as { url: string; provider: string };
            if (r.provider === "r2" && r.url && !r.url.startsWith("data:")) {
              logoUrl = r.url;
              logoData = null; // Don't store base64 in DB when R2 is used
            }
          }
        } catch {
          // Fall through to store base64 in DB
        }
      }
      if (logoUrl) {
        sets.push(`logo_url = $${idx++}`);
        args.push(logoUrl);
      }
      sets.push(`logo_data = $${idx++}`);
      args.push(logoData);
    }
    if (data.brandColor !== undefined) {
      sets.push(`brand_color = $${idx++}`);
      args.push(data.brandColor);
    }
    if (data.brandFont !== undefined) {
      sets.push(`brand_font = $${idx++}`);
      args.push(data.brandFont);
    }
    if (data.companyName !== undefined) {
      sets.push(`name = $${idx++}`);
      args.push(data.companyName);
    }

    if (sets.length === 0) return { ok: true };

    sets.push(`updated_at = NOW()`);
    args.push(context.tenantId);

    await dbExecute(
      `UPDATE tenants SET ${sets.join(", ")} WHERE id = $${idx}`,
      args,
    );
    return { ok: true };
  });
