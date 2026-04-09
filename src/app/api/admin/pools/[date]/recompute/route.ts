import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { runDailySettlement } from "@/jobs/daily-settlement";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { date } = await params;
  const targetDate = new Date(date);

  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const result = await runDailySettlement(targetDate);
  return NextResponse.json({ success: true, result });
}
