import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

// ─── Helpers ────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function generateCode(): string {
  // 12-char alphanumeric uppercase (e.g. "A3KF7B2MX9LP")
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // removed I,O,0,1 to avoid confusion
  const bytes = randomBytes(12);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

// ─── Generate Promo Code ────────────────────────────────────────────

export interface GeneratePromoCodeResult {
  id: string;
  code: string; // plaintext — shown only once
  code_prefix: string;
  discount_type: string;
  discount_value: number;
  max_uses: number;
  valid_until: string;
}

export const generatePromoCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({
      discount_type: z.enum(["free", "percentage"]),
      discount_value: z.number().int().min(0).max(100),
      max_uses: z.number().int().min(1).max(1000).default(1),
      valid_until: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
      tenant_id: z.string().uuid().optional(),
    });
    return schema.parse(input);
  })
  .handler(
    async ({ data }): Promise<GeneratePromoCodeResult> => {
      const { requireSuperAdminFn } = await import("@/lib/admin-guard");
      const admin = await requireSuperAdminFn();

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      // Generate code and hash
      const code = generateCode();
      const codeHash = sha256(code);
      const codePrefix = code.slice(0, 4) + "-****";

      const { data: promoCode, error } = await supabaseAdmin
        .from("promo_codes")
        .insert({
          code_hash: codeHash,
          code_prefix: codePrefix,
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          max_uses: data.max_uses,
          used_count: 0,
          valid_from: new Date().toISOString(),
          valid_until: new Date(data.valid_until).toISOString(),
          active: true,
          created_by: admin.userId,
          tenant_id: data.tenant_id ?? null,
        })
        .select("id, code_prefix, discount_type, discount_value, max_uses, valid_until")
        .single();

      if (error) throw error;

      return {
        id: promoCode.id,
        code, // plaintext — shown only once to admin
        code_prefix: promoCode.code_prefix,
        discount_type: promoCode.discount_type,
        discount_value: promoCode.discount_value,
        max_uses: promoCode.max_uses,
        valid_until: promoCode.valid_until,
      };
    },
  );

// ─── List Promo Codes ───────────────────────────────────────────────

export interface PromoCodeListItem {
  id: string;
  code_prefix: string;
  discount_type: string;
  discount_value: number;
  max_uses: number;
  used_count: number;
  valid_from: string;
  valid_until: string;
  active: boolean;
  created_at: string;
}

export const listPromoCodesFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const schema = z.object({
      limit: z.number().int().positive().max(100).default(50),
      offset: z.number().int().min(0).default(0),
    });
    return schema.parse(input);
  })
  .handler(
    async ({
      data,
    }): Promise<{ items: PromoCodeListItem[]; total: number }> => {
      const { requireSuperAdminFn } = await import("@/lib/admin-guard");
      await requireSuperAdminFn();

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const { data: codes, error, count } = await supabaseAdmin
        .from("promo_codes")
        .select(
          "id, code_prefix, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, active, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(data.offset, data.offset + data.limit - 1);

      if (error) throw error;

      return {
        items: (codes ?? []) as PromoCodeListItem[],
        total: count ?? 0,
      };
    },
  );

// ─── Toggle Promo Code Active ───────────────────────────────────────

export const togglePromoCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({
      id: z.string().uuid(),
      active: z.boolean(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }) => {
    const { requireSuperAdminFn } = await import("@/lib/admin-guard");
    await requireSuperAdminFn();

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { error } = await supabaseAdmin
      .from("promo_codes")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (error) throw error;
    return { success: true };
  });

// ─── Validate Promo Code (public-facing) ────────────────────────────

export interface PromoValidationResult {
  valid: boolean;
  discount_type: string;
  discount_value: number;
  message: string;
}

export const validatePromoCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({
      code: z.string().min(1),
    });
    return schema.parse(input);
  })
  .handler(
    async ({ data }): Promise<PromoValidationResult> => {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const codeHash = sha256(data.code.toUpperCase().trim());

      const { data: promoCode } = await supabaseAdmin
        .from("promo_codes")
        .select("id, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, active")
        .eq("code_hash", codeHash)
        .maybeSingle();

      if (!promoCode) {
        return { valid: false, discount_type: "", discount_value: 0, message: "Invalid promo code." };
      }

      if (!promoCode.active) {
        return { valid: false, discount_type: "", discount_value: 0, message: "This promo code has been deactivated." };
      }

      const now = new Date();
      if (new Date(promoCode.valid_until) < now) {
        return { valid: false, discount_type: "", discount_value: 0, message: "This promo code has expired." };
      }

      if (new Date(promoCode.valid_from) > now) {
        return { valid: false, discount_type: "", discount_value: 0, message: "This promo code is not yet active." };
      }

      if (promoCode.used_count >= promoCode.max_uses) {
        return { valid: false, discount_type: "", discount_value: 0, message: "This promo code has been fully used." };
      }

      return {
        valid: true,
        discount_type: promoCode.discount_type,
        discount_value: promoCode.discount_value,
        message:
          promoCode.discount_type === "free"
            ? "Free campaign activation!"
            : `${promoCode.discount_value}% discount applied.`,
      };
    },
  );
