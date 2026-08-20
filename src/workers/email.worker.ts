import { createWorker } from "@/lib/queue";
import { dbQueryFirst } from "@/lib/db";
import { dispatchCommunication } from "@/lib/email-dispatch";

const emailWorker = createWorker("email", async (job) => {
  const { communicationId } = job.data;
  if (!communicationId) return { status: "skipped" };

  // Load the row, then dispatch through the provider (SMTP/Resend/log).
  const row = await dbQueryFirst(
    "SELECT id, tenant_id, recipient, subject, body FROM communications WHERE id = ?",
    [communicationId],
  );
  if (!row) return { status: "missing" };

  // The dispatch helper updates status; reuse it with a minimal supabase-like
  // adapter backed by the same SQLite connection used by the workers.
  const supabaseLike = createSqliteSupabase();
  const outcome = await dispatchCommunication(
    row as Record<string, unknown>,
    supabaseLike,
  );

  console.log(`[Email Worker] ${communicationId}: ${outcome.sent ? "sent" : "failed"}`);
  return { communicationId, status: outcome.sent ? "sent" : "failed", error: outcome.error };
});

function createSqliteSupabase() {
  return {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          const { dbExecute } = await import("@/lib/db");
          const entries = Object.entries(values);
          const sets = entries.map(([key]) => `${key} = ?`).join(", ");
          const args = entries.map(([, v]) => v);
          const result = await dbExecute(
            `UPDATE ${table} SET ${sets} WHERE ${column} = ?`,
            [...args, value],
          );
          return { error: result.error ?? null };
        },
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  };
}

emailWorker.on("completed", (job) => {
  console.log(`[Email Worker] Completed: ${job.id}`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[Email Worker] Failed: ${job?.id}`, err);
});

export default emailWorker;
