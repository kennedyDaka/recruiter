import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Public API — returns active campaigns for the jobs listing page.
 * Uses supabaseAdmin to bypass RLS so anonymous visitors can see open roles.
 */
export const Route = createFileRoute("/api/public/jobs")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("campaigns")
            .select("id, name, job_title, location, employment_type, closing_date, status, public_token")
            .in("status", ["active", "closing_soon"])
            .order("created_at", { ascending: false });

          if (error) throw error;

          return json({ jobs: data ?? [] });
        } catch (e: any) {
          console.error("Public jobs API error:", e?.message);
          return json({ jobs: [], error: e?.message }, { status: 500 });
        }
      },
    },
  },
});
