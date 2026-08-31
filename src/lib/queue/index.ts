import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

let _connection: IORedis | null = null;

/**
 * Lazy Redis connection — created on first use so importing this module
 * does not crash when Redis is unavailable (e.g. in dev or during server
 * function SSR evaluation).
 */
export function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _connection;
}

/** @deprecated Use getConnection() instead */
export const connection = new Proxy({} as IORedis, {
  get(_target, prop, _receiver) {
    return (getConnection() as any)[prop];
  },
});

export function createQueue(name: string) {
  return new Queue(name, { connection: getConnection() });
}

export function createWorker(
  name: string,
  processor: (job: { data: any; name: string }) => Promise<any>,
) {
  return new Worker(name, processor, {
    connection: getConnection(),
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
  AI_PROCESSING: "ai-processing",
} as const;
