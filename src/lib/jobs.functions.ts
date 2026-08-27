import { createServerFn } from "@tanstack/react-start";

/**
 * Server function to fetch public active campaigns.
 * Runs on the server where RLS is bypassed via service-role key.
 */
export const getPublicJobsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .select(
        "id, name, job_title, location, employment_type, closing_date, status, public_token, tenants(name, logo_url, logo_data, brand_color, brand_font)"
      )
      .in("status", ["active", "closing_soon"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("getPublicJobsFn error:", error.message);
      return [];
    }

    return data ?? [];
  },
);
