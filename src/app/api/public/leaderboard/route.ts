import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "Asia/Shanghai";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const dateStr = searchParams.get("date"); // YYYY-MM-DD

  const now = toZonedTime(new Date(), TZ);
  const targetDate = dateStr ? new Date(dateStr) : startOfDay(subDays(now, 1));

  const [stats, total] = await Promise.all([
    prisma.creatorDailyStat.findMany({
      where: { statDate: targetDate },
      include: {
        user: {
          include: {
            socialAccounts: {
              where: { provider: "x" },
              select: {
                username: true,
                name: true,
                avatarUrl: true,
                followersCount: true,
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { rank: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.creatorDailyStat.count({ where: { statDate: targetDate } }),
  ]);

  const items = stats.map((s) => {
    const social = s.user.socialAccounts[0];
    return {
      userId: s.userId,
      rank: s.rank,
      username: social?.username || "unknown",
      displayName: social?.name || s.user.displayName || "Unknown",
      avatarUrl: social?.avatarUrl,
      followersCount: social?.followersCount || 0,
      indexScore: s.indexScore,
      mindsharePercent: Math.round(s.mindsharePercent * 100) / 100,
      dailyReward: s.dailyReward,
      dailyRewardDelta: s.dailyRewardDelta,
      totalReward: s.totalReward,
    };
  });

  // Get pool info
  const pool = await prisma.dailyQuotaPool.findUnique({
    where: { poolDate: targetDate },
  });

  return NextResponse.json({
    date: targetDate.toISOString().split("T")[0],
    pool: pool
      ? { quotaAmount: pool.quotaAmount, totalScore: pool.totalScore, status: pool.status }
      : null,
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
