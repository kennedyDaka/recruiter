import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { syncUniversities } from "@/lib/university-catalog";

export const Route = createAPIFileRoute("/api/catalogs/universities")({
  GET: async () => {
    try {
      const result = await syncUniversities();
      return json({ success: true, ...result });
    } catch (e: any) {
      return json({ success: false, error: e.message }, { status: 500 });
    }
  },
});