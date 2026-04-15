/**
 * Railway Worker — runs cron scheduler as a standalone long-running process.
 * Vercel (serverless) can't run node-cron, so this handles automated jobs.
 *
 * Usage: npx tsx worker.ts
 */

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Track running state to prevent overlapping runs
const jobRunning: Record<string, boolean> = {};
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout per job

async function runJob(name: string, fn: () => Promise<unknown>) {
  if (jobRunning[name]) {
    console.log(`[Worker] ${name} still running, skipping`);
    return;
  }
  jobRunning[name] = true;
  console.log(`[Worker] Starting ${name}...`);
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Job timeout after 5min")), JOB_TIMEOUT_MS)),
    ]);
    console.log(`[Worker] ${name} completed:`, JSON.stringify(result));
  } catch (err) {
    console.error(`[Worker] ${name} failed:`, err);
  } finally {
    jobRunning[name] = false;
  }
}

async function getSchedulerConfig() {
  const rows = await prisma.appConfig.findMany({
    where: {
      key: {
        in: [
          "scheduler_ingest_enabled",
          "scheduler_ingest_interval_minutes",
          "scheduler_score_enabled",
          "scheduler_score_interval_minutes",
          "scheduler_settle_enabled",
          "scheduler_settle_interval_minutes",
        ],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    ingestEnabled: map.get("scheduler_ingest_enabled") === "true",
    ingestInterval: parseInt(map.get("scheduler_ingest_interval_minutes") || "15") || 15,
    scoreEnabled: map.get("scheduler_score_enabled") === "true",
    scoreInterval: parseInt(map.get("scheduler_score_interval_minutes") || "30") || 30,
    settleEnabled: map.get("scheduler_settle_enabled") === "true",
    settleInterval: parseInt(map.get("scheduler_settle_interval_minutes") || "5") || 5,
  };
}

function minutesToCron(minutes: number): string {
  if (minutes <= 0) minutes = 1;
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

function minutesToCronOffset(minutes: number, offset: number): string {
  if (minutes <= 0) minutes = 1;
  if (minutes < 60) {
    // e.g. every 15 min offset 5 → "5,20,35,50 * * * *"
    const points = [];
    for (let m = offset % minutes; m < 60; m += minutes) points.push(m);
    return `${points.join(",")} * * * *`;
  }
  const hours = Math.floor(minutes / 60);
  return `${offset} */${hours} * * *`;
}

let ingestTask: cron.ScheduledTask | null = null;
let scoreTask: cron.ScheduledTask | null = null;
let settleTask: cron.ScheduledTask | null = null;

async function syncScheduler() {
  const config = await getSchedulerConfig();

  // Ingest — runs at :00, :15, :30, :45 (offset 0)
  if (ingestTask) { ingestTask.stop(); ingestTask = null; }
  if (config.ingestEnabled) {
    const { runTweetIngest } = await import("./src/jobs/tweet-ingest");
    ingestTask = cron.schedule(minutesToCron(config.ingestInterval), () => {
      runJob("tweet-ingest", runTweetIngest);
    });
    console.log(`[Worker] tweet-ingest scheduled every ${config.ingestInterval}min`);
  } else {
    console.log(`[Worker] tweet-ingest disabled`);
  }

  // Score — offset by 5 minutes to avoid overlap with ingest
  if (scoreTask) { scoreTask.stop(); scoreTask = null; }
  if (config.scoreEnabled) {
    const { runTweetScore } = await import("./src/jobs/tweet-score");
    const scoreOffset = Math.min(5, Math.floor(config.scoreInterval / 2));
    scoreTask = cron.schedule(minutesToCronOffset(config.scoreInterval, scoreOffset), () => {
      runJob("tweet-score", runTweetScore);
    });
    console.log(`[Worker] tweet-score scheduled every ${config.scoreInterval}min (offset +${scoreOffset})`);
  } else {
    console.log(`[Worker] tweet-score disabled`);
  }

  // Epoch Settlement — offset by 10 minutes
  if (settleTask) { settleTask.stop(); settleTask = null; }
  if (config.settleEnabled) {
    const { runEpochSettleAndExport } = await import("./src/jobs/epoch-settle-export");
    const settleOffset = Math.min(10, Math.floor(config.settleInterval / 2));
    settleTask = cron.schedule(minutesToCronOffset(config.settleInterval, settleOffset), () => {
      runJob("epoch-settle", runEpochSettleAndExport);
    });
    console.log(`[Worker] epoch-settle scheduled every ${config.settleInterval}min (offset +${settleOffset})`);
  } else {
    console.log(`[Worker] epoch-settle disabled`);
  }
}

async function main() {
  console.log("[Worker] Starting LVMON Quota worker...");
  console.log(`[Worker] DATABASE_URL: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@")}`);

  await syncScheduler();

  // Re-sync scheduler config every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    syncScheduler().catch(console.error);
  });

  console.log("[Worker] Ready. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[Worker] Fatal error:", err);
  process.exit(1);
});
