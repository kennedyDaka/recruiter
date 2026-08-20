import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/campaigns/$campaignId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data, error } = await supabaseAdmin
            .from("campaigns")
            .select(
              "id, tenant_id, name, slug, job_title, job_description, positions, location, employment_type, min_qualification, min_experience_years, salary_min, salary_max, salary_currency, closing_date, status, published_at",
            )
            .eq("id", params.campaignId)
            .maybeSingle();

          if (error) throw error;

          if (!data) {
            return json({ error: "Campaign not found" }, { status: 404 });
          }

          return json(data);
        } catch (error) {
          console.error("Failed to fetch campaign:", error);
          return json({ error: "Failed to fetch campaign" }, { status: 500 });
        }
      },
    },
  },
});
