import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 200);
  const filter = req.nextUrl.searchParams.get("type") || undefined; // "new" | "update"

  const where = filter ? { logType: filter } : {};

  const [logs, total] = await Promise.all([
    prisma.scoreLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.scoreLog.count({ where }),
  ]);

  return NextResponse.json({
    items: logs.map((l) => ({
      id: l.id,
      tweetId: l.tweetId,
      author: l.authorUsername,
      type: l.logType,
      quality: l.qualityScore,
      engagementPrev: l.engagementPrev,
      engagementNew: l.engagementNew,
      finalPrev: l.finalPrev,
      finalNew: l.finalNew,
      delta: l.delta,
      trust: l.trustMultiplier,
      time: l.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
