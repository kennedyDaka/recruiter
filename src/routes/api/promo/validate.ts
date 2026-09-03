import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/promo/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const schema = z.object({ code: z.string().min(1) });
          const data = schema.parse(body);

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const codeHash = createHash("sha256")
            .update(data.code.toUpperCase().trim())
            .digest("hex");

          const { data: promoCode } = await supabaseAdmin
            .from("promo_codes")
            .select(
              "id, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, active",
            )
            .eq("code_hash", codeHash)
            .maybeSingle();

          if (!promoCode) {
            return json(
              { valid: false, message: "Invalid promo code." },
              { status: 400 },
            );
          }

          if (!promoCode.active) {
            return json(
              { valid: false, message: "This promo code has been deactivated." },
              { status: 400 },
            );
          }

          const now = new Date();
          if (new Date(promoCode.valid_until) < now) {
            return json(
              { valid: false, message: "This promo code has expired." },
              { status: 400 },
            );
          }

          if (new Date(promoCode.valid_from) > now) {
            return json(
              { valid: false, message: "This promo code is not yet active." },
              { status: 400 },
            );
          }

          if (promoCode.used_count >= promoCode.max_uses) {
            return json(
              { valid: false, message: "This promo code has been fully used." },
              { status: 400 },
            );
          }

          return json({
            valid: true,
            discount_type: promoCode.discount_type,
            discount_value: promoCode.discount_value,
            message:
              promoCode.discount_type === "free"
                ? "Free campaign activation!"
                : `${promoCode.discount_value}% discount applied.`,
          });
        } catch (error: any) {
          console.error("Promo validation error:", error);
          return json({ valid: false, message: "Invalid request" }, { status: 400 });
        }
      },
    },
  },
});
