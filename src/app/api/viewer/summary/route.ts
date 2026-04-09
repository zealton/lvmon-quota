import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "Asia/Shanghai";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session as any).userId as string;
  if (!userId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = toZonedTime(new Date(), TZ);
  const yesterday = startOfDay(subDays(now, 1));

  const [user, socialAccount, latestStat, balance, recentStats] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.socialAccount.findFirst({
      where: { userId, provider: "x" },
    }),
    prisma.creatorDailyStat.findFirst({
      where: { userId },
      orderBy: { statDate: "desc" },
    }),
    prisma.quotaLedgerEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creatorDailyStat.findMany({
      where: { userId },
      orderBy: { statDate: "desc" },
      take: 7,
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    userId,
    username: socialAccount?.username,
    displayName: socialAccount?.name || user.displayName,
    avatarUrl: socialAccount?.avatarUrl,
    role: user.role,
    status: user.status,
    currentBalance: balance?.balanceAfter || 0,
    latestStat: latestStat
      ? {
          date: latestStat.statDate,
          rank: latestStat.rank,
          mindsharePercent: Math.round(latestStat.mindsharePercent * 100) / 100,
          dailyReward: latestStat.dailyReward,
          totalReward: latestStat.totalReward,
        }
      : null,
    recentStats: recentStats.map((s) => ({
      date: s.statDate,
      rank: s.rank,
      dailyReward: s.dailyReward,
      totalReward: s.totalReward,
    })),
  });
}
