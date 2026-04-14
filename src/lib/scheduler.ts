import cron, { ScheduledTask } from "node-cron";
import { prisma } from "./prisma";

export interface SchedulerJobState {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  running: boolean;
}

export interface SchedulerState {
  tweetIngest: SchedulerJobState;
  tweetScore: SchedulerJobState;
}

// In-memory task references
const tasks: Record<string, ScheduledTask | null> = {
  tweetIngest: null,
  tweetScore: null,
};

// In-memory running state
const runningState: Record<string, boolean> = {
  tweetIngest: false,
  tweetScore: false,
};

// Config keys in AppConfig
const CONFIG_KEYS = {
  tweetIngest: {
    enabled: "scheduler_ingest_enabled",
    interval: "scheduler_ingest_interval_minutes",
  },
  tweetScore: {
    enabled: "scheduler_score_enabled",
    interval: "scheduler_score_interval_minutes",
  },
};

const DEFAULTS = {
  tweetIngest: { enabled: false, intervalMinutes: 15 },
  tweetScore: { enabled: false, intervalMinutes: 30 },
};

async function getJobConfig(jobKey: "tweetIngest" | "tweetScore") {
  const keys = CONFIG_KEYS[jobKey];
  const defaults = DEFAULTS[jobKey];

  const rows = await prisma.appConfig.findMany({
    where: { key: { in: [keys.enabled, keys.interval] } },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    enabled: map.get(keys.enabled) === "true",
    intervalMinutes: parseInt(map.get(keys.interval) || String(defaults.intervalMinutes)) || defaults.intervalMinutes,
  };
}

async function getLastRun(jobName: string) {
  const lastJob = await prisma.jobRun.findFirst({
    where: { jobName },
    orderBy: { startedAt: "desc" },
  });
  return lastJob
    ? { lastRunAt: lastJob.startedAt.toISOString(), lastRunStatus: lastJob.status }
    : { lastRunAt: null, lastRunStatus: null };
}

function minutesToCron(minutes: number): string {
  if (minutes <= 0) minutes = 1;
  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

async function runJob(jobKey: "tweetIngest" | "tweetScore") {
  if (runningState[jobKey]) return;
  runningState[jobKey] = true;

  try {
    if (jobKey === "tweetIngest") {
      const { runTweetIngest } = await import("@/jobs/tweet-ingest");
      await runTweetIngest();
    } else {
      const { runTweetScore } = await import("@/jobs/tweet-score");
      await runTweetScore();
    }
  } catch (err) {
    console.error(`Scheduler error [${jobKey}]:`, err);
  } finally {
    runningState[jobKey] = false;
  }
}

function startTask(jobKey: "tweetIngest" | "tweetScore", intervalMinutes: number) {
  if (tasks[jobKey]) {
    tasks[jobKey]!.stop();
    tasks[jobKey] = null;
  }

  const cronExpr = minutesToCron(intervalMinutes);
  tasks[jobKey] = cron.schedule(cronExpr, () => {
    runJob(jobKey);
  });
}

function stopTask(jobKey: "tweetIngest" | "tweetScore") {
  if (tasks[jobKey]) {
    tasks[jobKey]!.stop();
    tasks[jobKey] = null;
  }
}

/**
 * Sync in-memory task state with DB.
 * Call this on startup and after any config change to ensure consistency.
 */
async function syncTask(jobKey: "tweetIngest" | "tweetScore") {
  const config = await getJobConfig(jobKey);
  const taskIsRunning = tasks[jobKey] !== null;

  if (config.enabled && !taskIsRunning) {
    startTask(jobKey, config.intervalMinutes);
  } else if (config.enabled && taskIsRunning) {
    // Restart with possibly updated interval
    startTask(jobKey, config.intervalMinutes);
  } else if (!config.enabled && taskIsRunning) {
    stopTask(jobKey);
  }
}

// Public API

export async function getSchedulerState(): Promise<SchedulerState> {
  // Always read from DB as the single source of truth
  const [ingestConfig, scoreConfig, ingestLast, scoreLast] = await Promise.all([
    getJobConfig("tweetIngest"),
    getJobConfig("tweetScore"),
    getLastRun("tweet-ingest"),
    getLastRun("tweet-score"),
  ]);

  // Ensure in-memory tasks match DB state
  // (handles edge cases like hot-reloads or stale memory)
  if (ingestConfig.enabled && !tasks.tweetIngest) {
    startTask("tweetIngest", ingestConfig.intervalMinutes);
  } else if (!ingestConfig.enabled && tasks.tweetIngest) {
    stopTask("tweetIngest");
  }
  if (scoreConfig.enabled && !tasks.tweetScore) {
    startTask("tweetScore", scoreConfig.intervalMinutes);
  } else if (!scoreConfig.enabled && tasks.tweetScore) {
    stopTask("tweetScore");
  }

  return {
    tweetIngest: {
      enabled: ingestConfig.enabled,
      intervalMinutes: ingestConfig.intervalMinutes,
      lastRunAt: ingestLast.lastRunAt,
      lastRunStatus: ingestLast.lastRunStatus,
      running: runningState.tweetIngest,
    },
    tweetScore: {
      enabled: scoreConfig.enabled,
      intervalMinutes: scoreConfig.intervalMinutes,
      lastRunAt: scoreLast.lastRunAt,
      lastRunStatus: scoreLast.lastRunStatus,
      running: runningState.tweetScore,
    },
  };
}

export async function setSchedulerJob(
  jobKey: "tweetIngest" | "tweetScore",
  update: { enabled?: boolean; intervalMinutes?: number }
) {
  const keys = CONFIG_KEYS[jobKey];
  const current = await getJobConfig(jobKey);

  const enabled = update.enabled ?? current.enabled;
  const intervalMinutes = update.intervalMinutes ?? current.intervalMinutes;

  // Persist to DB first (single source of truth)
  await Promise.all([
    prisma.appConfig.upsert({
      where: { key: keys.enabled },
      update: { value: String(enabled) },
      create: { key: keys.enabled, value: String(enabled) },
    }),
    prisma.appConfig.upsert({
      where: { key: keys.interval },
      update: { value: String(intervalMinutes) },
      create: { key: keys.interval, value: String(intervalMinutes) },
    }),
  ]);

  // Then sync in-memory state to match DB
  await syncTask(jobKey);
}

/**
 * Initialize scheduler on app startup — sync all tasks with DB state
 */
export async function initScheduler() {
  for (const jobKey of ["tweetIngest", "tweetScore"] as const) {
    await syncTask(jobKey);
    const config = await getJobConfig(jobKey);
    if (config.enabled) {
      console.log(`[Scheduler] ${jobKey} started — every ${config.intervalMinutes}min`);
    } else {
      console.log(`[Scheduler] ${jobKey} is disabled`);
    }
  }
}
