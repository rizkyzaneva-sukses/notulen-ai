import { Queue, type ConnectionOptions } from "bullmq";

const connection: ConnectionOptions = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
  maxRetriesPerRequest: null,
};

export const SESSION_QUEUE = "session-processing";

export type SessionJobName =
  | "process-session"
  | "regenerate-summary"
  | "process-meeting-bot";

export interface ProcessSessionJob {
  sessionId: string;
}

export interface RegenerateSummaryJob {
  sessionId: string;
}

let queue: Queue | null = null;

export function getSessionQueue(): Queue {
  if (!queue) {
    queue = new Queue(SESSION_QUEUE, { connection });
  }
  return queue;
}

export async function enqueueSessionProcess(sessionId: string) {
  const q = getSessionQueue();
  await q.add(
    "process-session",
    { sessionId } satisfies ProcessSessionJob,
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

export async function enqueueRegenerateSummary(sessionId: string) {
  const q = getSessionQueue();
  await q.add(
    "regenerate-summary",
    { sessionId } satisfies RegenerateSummaryJob,
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    }
  );
}

export { connection as redisConnection };
