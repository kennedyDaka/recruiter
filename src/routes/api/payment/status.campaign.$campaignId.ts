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
            .select("id, name, status, public_token")
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
            publicToken: data.public_token,
            public_token: data.public_token,
          });
        } catch (error) {
          console.error("Failed to fetch campaign status:", error);
          return json({ error: "Failed to fetch campaign status" }, { status: 500 });
        }
      },
    },
  },
});
