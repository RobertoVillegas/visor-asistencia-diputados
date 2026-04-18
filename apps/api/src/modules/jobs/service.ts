import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import { db } from "../../db";
import { jobQueue } from "../../db/schema";
import type { jobStatusEnum, jobTypeEnum } from "../../db/schema";
import { env } from "../../env";
import { logger } from "../../lib/logger";
import { processAllPeriodsPipeline, processPeriodPipeline } from "../attendance/service";
import { fetchLatestPeriod } from "../gaceta/client";

type JobType = (typeof jobTypeEnum.enumValues)[number];
type JobStatus = (typeof jobStatusEnum.enumValues)[number];

interface ProcessPeriodPayload {
  periodId?: string;
  periodPageUrl?: string;
  forceParseAll?: boolean;
}

interface ProcessAllPeriodsPayload {
  legislature?: string;
  forceParseAll?: boolean;
}

interface EnqueueJobInput {
  type: JobType;
  payload: Record<string, unknown>;
  createdByEmail?: string | null;
  runAt?: Date;
  dedupeKey?: string | null;
  priority?: number;
}

let workerStarted = false;
let workerBusy = false;
let schedulerStarted = false;
let cronTimeout: Timer | null = null;

function getNextRunDate(hour: number) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function getCronDedupeKey(targetDate: Date, legislature?: string) {
  return `cron:${targetDate.toISOString().slice(0, 10)}:${legislature ?? "ALL"}`;
}

async function updateJobProgress(jobId: string, progress: Record<string, unknown>) {
  await db
    .update(jobQueue)
    .set({
      progress,
      updatedAt: new Date(),
    })
    .where(eq(jobQueue.id, jobId));
}

export async function enqueueJob(input: EnqueueJobInput) {
  const [job] = await db
    .insert(jobQueue)
    .values({
      createdByEmail: input.createdByEmail ?? null,
      dedupeKey: input.dedupeKey ?? null,
      payload: input.payload,
      priority: input.priority ?? 100,
      runAt: input.runAt ?? new Date(),
      type: input.type,
    })
    .onConflictDoNothing({
      target: jobQueue.dedupeKey,
    })
    .returning();

  if (job) {
    logger.info(
      {
        dedupeKey: job.dedupeKey,
        jobId: job.id,
        type: job.type,
      },
      "Queued background job",
    );
    return job;
  }

  const [existing] = await db
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.dedupeKey, input.dedupeKey ?? ""))
    .limit(1);

  if (!existing) {
    throw new Error("Failed to enqueue job.");
  }

  return existing;
}

export async function enqueueProcessPeriodJob(
  payload: ProcessPeriodPayload,
  createdByEmail?: string | null,
) {
  return enqueueJob({
    createdByEmail,
    payload: payload as Record<string, unknown>,
    type: "process_period",
  });
}

export async function enqueueProcessAllPeriodsJob(
  payload: ProcessAllPeriodsPayload,
  createdByEmail?: string | null,
  dedupeKey?: string | null,
) {
  return enqueueJob({
    createdByEmail,
    dedupeKey,
    payload: payload as Record<string, unknown>,
    type: "process_all_periods",
  });
}

export async function listJobs(filters?: { status?: JobStatus; type?: JobType; limit?: number }) {
  const clauses = [];

  if (filters?.status) {
    clauses.push(eq(jobQueue.status, filters.status));
  }
  if (filters?.type) {
    clauses.push(eq(jobQueue.type, filters.type));
  }

  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const jobs = await db
    .select()
    .from(jobQueue)
    .where(whereClause)
    .orderBy(desc(jobQueue.createdAt), asc(jobQueue.runAt))
    .limit(filters?.limit ?? 100);

  const [stats] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${jobQueue.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${jobQueue.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${jobQueue.status} = 'pending')::int`,
      running: sql<number>`count(*) filter (where ${jobQueue.status} = 'running')::int`,
    })
    .from(jobQueue);

  return {
    jobs,
    stats,
  };
}

export async function getJobById(jobId: string) {
  const [job] = await db.select().from(jobQueue).where(eq(jobQueue.id, jobId)).limit(1);

  if (!job) {
    throw new Error("Job not found.");
  }

  return job;
}

async function claimNextJob() {
  const [job] = await db
    .select()
    .from(jobQueue)
    .where(and(eq(jobQueue.status, "pending"), lte(jobQueue.runAt, new Date())))
    .orderBy(asc(jobQueue.priority), asc(jobQueue.runAt), asc(jobQueue.createdAt))
    .limit(1);

  if (!job) {
    return null;
  }

  const [claimed] = await db
    .update(jobQueue)
    .set({
      attempts: job.attempts + 1,
      startedAt: new Date(),
      status: "running",
      updatedAt: new Date(),
    })
    .where(and(eq(jobQueue.id, job.id), eq(jobQueue.status, "pending")))
    .returning();

  return claimed ?? null;
}

async function completeJob(jobId: string, result: unknown) {
  await db
    .update(jobQueue)
    .set({
      errorMessage: null,
      finishedAt: new Date(),
      result: result as Record<string, unknown>,
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(jobQueue.id, jobId));
}

async function failJob(job: Awaited<ReturnType<typeof claimNextJob>>, error: unknown) {
  if (!job) {
    return;
  }

  const shouldRetry = job.attempts < job.maxAttempts;
  const status: JobStatus = shouldRetry ? "pending" : "failed";
  const retryAt = shouldRetry ? new Date(Date.now() + 5 * 60 * 1000) : job.runAt;
  const message = error instanceof Error ? error.message : "Unknown job error";

  await db
    .update(jobQueue)
    .set({
      errorMessage: message,
      finishedAt: shouldRetry ? null : new Date(),
      progress: {
        message,
        stage: shouldRetry ? "retry_scheduled" : "failed",
      },
      runAt: retryAt,
      status,
      updatedAt: new Date(),
    })
    .where(eq(jobQueue.id, job.id));

  logger.error(
    {
      attempts: job.attempts,
      error: message,
      jobId: job.id,
      shouldRetry,
      type: job.type,
    },
    "Background job failed",
  );
}

async function runJob(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  logger.info(
    {
      jobId: job.id,
      type: job.type,
    },
    "Starting background job",
  );

  if (job.type === "process_period") {
    const payload = job.payload as ProcessPeriodPayload;
    const result = await processPeriodPipeline({
      ...payload,
      onProgress: async (progress) => {
        await updateJobProgress(job.id, progress);
      },
    });
    await completeJob(job.id, result);
    return;
  }

  if (job.type === "process_all_periods") {
    const payload = job.payload as ProcessAllPeriodsPayload;
    const result = await processAllPeriodsPipeline({
      ...payload,
      onProgress: async (progress) => {
        await updateJobProgress(job.id, progress);
      },
    });
    await completeJob(job.id, result);
    return;
  }

  throw new Error(`Unsupported job type: ${job.type}`);
}

export async function processNextJob() {
  if (workerBusy) {
    return false;
  }
  workerBusy = true;

  try {
    const job = await claimNextJob();
    if (!job) {
      return false;
    }

    try {
      await runJob(job);
      logger.info(
        {
          jobId: job.id,
          type: job.type,
        },
        "Background job completed",
      );
    } catch (error) {
      await failJob(job, error);
    }

    return true;
  } finally {
    workerBusy = false;
  }
}

function scheduleDailyJob() {
  if (!env.CRON_ENABLED) {
    logger.info("Daily crawl scheduler disabled");
    return;
  }

  const nextRun = getNextRunDate(env.CRON_HOUR);
  const delay = nextRun.getTime() - Date.now();

  logger.info(
    {
      legislatureOverride: env.CRON_TARGET_LEGISLATURE ?? null,
      nextRunAt: nextRun.toISOString(),
    },
    "Scheduled next daily crawl job",
  );

  cronTimeout = setTimeout(async () => {
    let targetLegislature = env.CRON_TARGET_LEGISLATURE;

    if (!targetLegislature) {
      try {
        const latest = await fetchLatestPeriod();
        targetLegislature = latest?.legislature;
        logger.info(
          { legislature: targetLegislature ?? null, source: "gaceta" },
          "Resolved latest legislature for cron run",
        );
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : "Unknown latest-period error",
          },
          "Could not resolve latest legislature, falling back to all",
        );
      }
    }

    try {
      await enqueueProcessAllPeriodsJob(
        {
          forceParseAll: false,
          legislature: targetLegislature,
        },
        "system:cron",
        getCronDedupeKey(nextRun, targetLegislature),
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown cron enqueue error",
        },
        "Failed to enqueue scheduled crawl job",
      );
    } finally {
      scheduleDailyJob();
    }
  }, delay);
}

export function startBackgroundServices() {
  if (!workerStarted) {
    workerStarted = true;
    setInterval(() => {
      void processNextJob();
    }, env.JOB_POLL_INTERVAL_MS);
    logger.info(
      {
        pollIntervalMs: env.JOB_POLL_INTERVAL_MS,
      },
      "Background job worker started",
    );
  }

  if (!schedulerStarted) {
    schedulerStarted = true;
    scheduleDailyJob();
  }

  return () => {
    if (cronTimeout) {
      clearTimeout(cronTimeout);
      cronTimeout = null;
    }
  };
}
