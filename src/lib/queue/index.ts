import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export function createQueue(name: string) {
  return new Queue(name, { connection });
}

export function createWorker(
  name: string,
  processor: (job: { data: any; name: string }) => Promise<any>,
) {
  return new Worker(name, processor, {
    connection,
    concurrency: 5,
  });
}

// ─── Queue Names ────────────────────────────────────────────────────

export const QUEUES = {
  CV_PROCESSING: "cv-processing",
  SCORING: "scoring",
  EMAIL: "email",
  SMS: "sms",
  NOTIFICATIONS: "notifications",
  EXPORTS: "exports",
} as const;
