/**
 * Server-side database client — backed by libsql query builder.
 * Used in server functions that need unrestricted DB access.
 */

import { from } from "@/lib/db";

export const supabaseAdmin = {
  auth: {
    admin: {
      getUserById: async (id: string) => {
        const { from: f } = await import("@/lib/db");
        const profile = await f("profiles").select("id, email, full_name").eq("id", id).maybeSingle();
        return {
          data: profile.data ? { user: { id: profile.data.id, email: profile.data.email } } : null,
          error: null,
        };
      },
    },
  },
  from,
};
