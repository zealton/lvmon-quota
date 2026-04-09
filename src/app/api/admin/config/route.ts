import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getConfig, setConfig } from "@/lib/config";

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

  const config = await getConfig();
  return NextResponse.json({ success: true, config });
}
