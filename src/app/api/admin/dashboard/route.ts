import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [
    totalUsers,
    totalTweets,
    tweetsByStatus,
    recentPools,
    recentJobs,
    config,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.tweet.count(),
    prisma.tweet.groupBy({ by: ["status"], _count: true }),
    prisma.dailyQuotaPool.findMany({
      orderBy: { poolDate: "desc" },
      take: 7,
    }),
    prisma.jobRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    getConfig(),
  ]);

  return NextResponse.json({
    totalUsers,
    totalTweets,
    tweetsByStatus: Object.fromEntries(
      tweetsByStatus.map((s) => [s.status, s._count])
    ),
    currentConfig: {
      search_handle: config.search_handle,
      max_search_results: config.max_search_results,
      daily_quota_pool: config.daily_quota_pool,
    },
    recentPools: recentPools.map((p) => ({
      date: p.poolDate,
      amount: p.quotaAmount,
      totalScore: p.totalScore,
      status: p.status,
    })),
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      name: j.jobName,
      status: j.status,
      startedAt: j.startedAt,
      endedAt: j.endedAt,
      result: j.result,
      error: j.error,
    })),
  });
}
