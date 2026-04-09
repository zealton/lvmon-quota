import { NextRequest, NextResponse } from "next/server";
import { runTweetIngest } from "@/jobs/tweet-ingest";
import { runTweetScore } from "@/jobs/tweet-score";
import { runDailySettlement } from "@/jobs/daily-settlement";
import { runQuotaExpiry } from "@/jobs/quota-expiry";
import { runXProfileRefresh } from "@/jobs/x-profile-refresh";

const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job, secret } = body;

  // Simple auth for cron endpoints
  if (secret !== CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let result;
    switch (job) {
      case "tweet-ingest":
        result = await runTweetIngest();
        break;
      case "tweet-score":
        result = await runTweetScore();
        break;
      case "daily-settlement":
        result = await runDailySettlement();
        break;
      case "quota-expiry":
        result = await runQuotaExpiry();
        break;
      case "x-profile-refresh":
        result = await runXProfileRefresh();
        break;
      default:
        return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
