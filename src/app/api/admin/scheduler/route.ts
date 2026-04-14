import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSchedulerState, setSchedulerJob } from "@/lib/scheduler";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const state = await getSchedulerState();
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { jobKey, enabled, intervalMinutes } = body;

  if (!jobKey || !["tweetIngest", "tweetScore", "epochSettle"].includes(jobKey)) {
    return NextResponse.json({ error: "Invalid jobKey" }, { status: 400 });
  }

  await setSchedulerJob(jobKey, { enabled, intervalMinutes });
  const state = await getSchedulerState();

  return NextResponse.json({ success: true, state });
}
