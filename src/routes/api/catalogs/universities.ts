import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { syncUniversities } from "@/lib/university-catalog";

export const Route = createFileRoute("/api/catalogs/universities")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await syncUniversities();
          return json({ success: true, ...result });
        } catch (e: any) {
          return json({ success: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
