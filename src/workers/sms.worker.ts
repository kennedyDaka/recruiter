import { createWorker, QUEUES } from "@/lib/queue";
import { dbExecute } from "@/lib/db";

const smsWorker = createWorker("sms", async (job) => {
  const { communicationId, recipient, message } = job.data;

  console.log(`[SMS Worker] Sending SMS to ${recipient}`);

  // TODO: Integrate with Africa's Talking or local SMS provider

  if (communicationId) {
    await dbExecute(
      "UPDATE communications SET status = ?, sent_at = NOW() WHERE id = ?",
      ["sent", communicationId],
    );
  }

  return { communicationId, status: "sent" };
});

smsWorker.on("completed", (job) => {
  console.log(`[SMS Worker] Completed: ${job.id}`);
});

smsWorker.on("failed", (job, err) => {
  console.error(`[SMS Worker] Failed: ${job?.id}`, err);
});

export default smsWorker;
