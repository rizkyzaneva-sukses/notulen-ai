import { Worker, type Job } from "bullmq";
import {
  SESSION_QUEUE,
  redisConnection,
  type ProcessSessionJob,
  type RegenerateSummaryJob,
} from "../src/lib/queue";
import {
  processSession,
  generateSummaryForSession,
} from "../src/lib/process-session";

console.log("[worker] starting Notulen AI worker...");
console.log("[worker] queue:", SESSION_QUEUE);
console.log("[worker] redis:", process.env.REDIS_URL || "redis://localhost:6379");

const worker = new Worker(
  SESSION_QUEUE,
  async (job: Job) => {
    console.log(`[worker] job ${job.id} name=${job.name}`, job.data);
    if (job.name === "process-session") {
      const { sessionId } = job.data as ProcessSessionJob;
      await processSession(sessionId);
      return { ok: true, sessionId };
    }
    if (job.name === "regenerate-summary") {
      const { sessionId } = job.data as RegenerateSummaryJob;
      await generateSummaryForSession(sessionId);
      return { ok: true, sessionId };
    }
    if (job.name === "process-meeting-bot") {
      const { sessionId } = job.data as ProcessSessionJob;
      await processSession(sessionId);
      return { ok: true, sessionId };
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] completed ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.id}:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] error:", err);
});

async function shutdown() {
  console.log("[worker] shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
