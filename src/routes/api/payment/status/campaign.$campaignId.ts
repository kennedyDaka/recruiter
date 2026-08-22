import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payment/status/campaign/$campaignId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { campaignId } = params;
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("campaigns")
            .select("id, name, status, public_token, closing_date, published_at")
            .eq("id", campaignId)
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            return json({ error: "Campaign not found" }, { status: 404 });
          }

          return json({
            id: data.id,
            name: data.name,
            status: data.status,
            public_token: data.public_token,
            publicToken: data.public_token,
            closingDate: data.closing_date,
            closing_date: data.closing_date,
            publishedAt: data.published_at,
            published_at: data.published_at,
          });
        } catch (error) {
          console.error("Failed to fetch campaign status:", error);
          return json({ error: "Failed to fetch campaign status" }, { status: 500 });
        }
      },
    },
  },
});
