import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getConfig, setConfig } from "@/lib/config";
import { setSchedulerJob } from "@/lib/scheduler";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const config = await getConfig();
  return NextResponse.json(config);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const updates: Record<string, string> = body;

  for (const [key, value] of Object.entries(updates)) {
    await setConfig(key, String(value));
  }

  // Sync epoch settlement interval when epoch duration changes
  if ("epoch_duration_hours" in updates) {
    const hours = parseFloat(String(updates.epoch_duration_hours)) || 24;
    const intervalMin = Math.max(1, Math.round(hours * 60));
    await setSchedulerJob("epochSettle", { intervalMinutes: intervalMin });
  }

  const config = await getConfig();
  return NextResponse.json({ success: true, config });
}
