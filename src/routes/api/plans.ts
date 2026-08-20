import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/plans")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("plans")
            .select("id, name, slug, description, duration_days, price, currency, candidate_limit, recruiter_limit, features")
            .eq("active", true)
            .order("sort_order");

          if (error) throw error;

          return json(data ?? []);
        } catch (error) {
          console.error("Failed to fetch plans:", error);
          return json({ error: "Failed to fetch plans" }, { status: 500 });
        }
      },
    },
  },
});
