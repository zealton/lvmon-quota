import { NextRequest, NextResponse } from "next/server";
import { runTweetIngest } from "@/jobs/tweet-ingest";
import { runTweetScore } from "@/jobs/tweet-score";
import { runDailySettlement } from "@/jobs/daily-settlement";
import { runQuotaExpiry } from "@/jobs/quota-expiry";
import { runXProfileRefresh } from "@/jobs/x-profile-refresh";

const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

// Track running jobs to prevent double-triggering
const runningJobs = new Set<string>();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job, secret } = body;

  // Simple auth for cron endpoints
  if (secret !== CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobMap: Record<string, () => Promise<unknown>> = {
    "tweet-ingest": runTweetIngest,
    "tweet-score": runTweetScore,
    "daily-settlement": runDailySettlement,
    "quota-expiry": runQuotaExpiry,
    "x-profile-refresh": runXProfileRefresh,
  };

  const jobFn = jobMap[job];
  if (!jobFn) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
  }

  if (runningJobs.has(job)) {
    return NextResponse.json({ success: true, status: "already_running" });
  }

  // Fire and forget — return immediately, job runs in background
  runningJobs.add(job);
  jobFn()
    .catch((error: unknown) => console.error(`Job ${job} failed:`, error))
    .finally(() => runningJobs.delete(job));

  return NextResponse.json({ success: true, status: "started" });
}
