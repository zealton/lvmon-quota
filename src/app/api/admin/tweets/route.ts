import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 100);
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam) : null;

  const where: {
    status?: "captured" | "eligible" | "quality_scored" | "scored" | "rejected" | "settled";
    capturedAt?: { gte: Date };
  } = {};
  if (status) {
    where.status = status as "captured" | "eligible" | "quality_scored" | "scored" | "rejected" | "settled";
  }
  if (days && days > 0) {
    where.capturedAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  const [tweets, total] = await Promise.all([
    prisma.tweet.findMany({
      where,
      include: {
        score: true,
        user: {
          include: {
            socialAccounts: {
              where: { provider: "x" },
              select: { username: true },
              take: 1,
            },
          },
        },
        metricSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      },
      orderBy: { capturedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tweet.count({ where }),
  ]);

  return NextResponse.json({
    items: tweets.map((t) => ({
      id: t.id,
      tweetId: t.tweetId,
      text: t.text.slice(0, 280),
      status: t.status,
      authorUsername: t.user?.socialAccounts[0]?.username || "unbound",
      createdAtX: t.createdAtX,
      capturedAt: t.capturedAt,
      score: t.score
        ? {
            quality: t.score.qualityScore,
            engagement: t.score.engagementScore,
            trust: t.score.trustMultiplier,
            final: t.score.finalScore,
            riskLevel: t.score.riskLevel,
          }
        : null,
      metrics: t.metricSnapshots[0]
        ? {
            likes: t.metricSnapshots[0].likeCount,
            replies: t.metricSnapshots[0].replyCount,
            retweets: t.metricSnapshots[0].retweetCount,
          }
        : null,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
