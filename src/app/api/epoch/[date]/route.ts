import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TweetStatus } from "@prisma/client";
import { getConfig } from "@/lib/config";

/**
 * Public API for LeverUp backend to pull epoch settlement data.
 *
 * GET /api/epoch/2026-04-13
 * GET /api/epoch/latest       — returns the most recent settled epoch
 * GET /api/epoch/current      — returns the current (live, unsettled) epoch
 *
 * Query params:
 *   ?key=xxx  — optional API key for production auth
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date: dateParam } = await params;

  // Optional API key auth
  const apiKey = req.nextUrl.searchParams.get("key");
  const expectedKey = process.env.EPOCH_API_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getConfig();

  // Handle special date values
  if (dateParam === "current") {
    return getCurrentEpoch(config);
  }

  let targetDate: Date;
  if (dateParam === "latest") {
    const latestPool = await prisma.dailyQuotaPool.findFirst({
      where: { status: "settled" },
      orderBy: { poolDate: "desc" },
    });
    if (!latestPool) {
      return NextResponse.json({ error: "No settled epochs found" }, { status: 404 });
    }
    targetDate = latestPool.poolDate;
  } else {
    targetDate = new Date(dateParam + "T00:00:00.000Z");
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }
  }

  // Get pool
  const pool = await prisma.dailyQuotaPool.findUnique({
    where: { poolDate: targetDate },
  });

  if (!pool) {
    return NextResponse.json({ error: `No epoch data for ${dateParam}` }, { status: 404 });
  }

  // Get issuances with user data
  const issuances = await prisma.quotaIssuance.findMany({
    where: { poolDate: targetDate },
    include: {
      user: {
        include: {
          socialAccounts: {
            where: { provider: "x" },
            take: 1,
          },
        },
      },
    },
    orderBy: { quotaAmount: "desc" },
  });

  // Get user daily scores for tweet details
  const userScores = await prisma.userDailyScore.findMany({
    where: { scoreDate: targetDate },
  });
  const scoreMap = new Map(userScores.map((s) => [s.userId, s]));

  // Get best tweet per user for author followers data
  const userBestTweets = await prisma.tweet.findMany({
    where: {
      userId: { in: issuances.map((i) => i.userId) },
      status: "settled",
    },
    include: { score: true },
    orderBy: { score: { finalScore: "desc" } },
  });
  const bestTweetMap = new Map<string, typeof userBestTweets[0]>();
  for (const t of userBestTweets) {
    if (t.userId && !bestTweetMap.has(t.userId)) bestTweetMap.set(t.userId, t);
  }

  // Build response
  const participants = issuances.map((iss, idx) => {
    const social = iss.user.socialAccounts[0];
    const dailyScore = scoreMap.get(iss.userId);
    const bestTweet = bestTweetMap.get(iss.userId);

    return {
      rank: idx + 1,
      twitter: {
        username: social?.username || bestTweet?.authorUsername || null,
        name: social?.name || bestTweet?.authorName || null,
        userId: social?.providerUserId || bestTweet?.authorXUserId || null,
        followersCount: social?.followersCount || bestTweet?.authorFollowers || 0,
        verified: social?.verified || bestTweet?.authorVerified || false,
      },
      wallet: iss.user.walletAddress || null,
      score: {
        best: iss.sourceUserScore,
        score1: dailyScore?.score1 || null,
        score2: dailyScore?.score2 || null,
        score3: dailyScore?.score3 || null,
        tweetsEligible: dailyScore?.tweetCountEligible || 0,
      },
      mindsharePercent: pool.totalScore > 0
        ? Math.round((iss.sourceUserScore / pool.totalScore) * 10000) / 100
        : 0,
      quota: iss.quotaAmount,
    };
  });

  // Calculate epoch number: count all settled pools up to and including this date
  const epochNumber = await prisma.dailyQuotaPool.count({
    where: { poolDate: { lte: targetDate }, status: { not: "open" } },
  });

  return NextResponse.json({
    epoch: {
      number: epochNumber,
      date: targetDate.toISOString().split("T")[0],
      status: pool.status,
      poolSize: pool.quotaAmount,
      totalScore: Math.round(pool.totalScore * 100) / 100,
      participantCount: issuances.length,
    },
    participants,
  });
}

/**
 * Returns live (unsettled) epoch data based on currently scored tweets.
 */
async function getCurrentEpoch(config: { daily_quota_pool: number }) {
  const scoredTweets = await prisma.tweet.findMany({
    where: {
      status: { in: [TweetStatus.quality_scored, TweetStatus.scored] },
      score: { isPublic: true },
    },
    include: {
      score: true,
      user: {
        include: {
          socialAccounts: { where: { provider: "x" }, take: 1 },
        },
      },
    },
  });

  // Group by author — best tweet only
  const authorBest = new Map<string, {
    userId: string | null;
    username: string | null;
    name: string | null;
    providerUserId: string | null;
    followersCount: number;
    verified: boolean;
    walletAddress: string | null;
    bestScore: number;
    qualityScore: number;
    engagementScore: number;
    trustMultiplier: number;
    tweetId: string;
    tweetCount: number;
    engagementPending: boolean;
  }>();

  for (const t of scoredTweets) {
    if (!t.score) continue;
    const key = t.authorXUserId;
    const existing = authorBest.get(key);
    const social = t.user?.socialAccounts?.[0];
    const score = t.score.finalScore;

    if (!existing || score > existing.bestScore) {
      authorBest.set(key, {
        userId: t.userId,
        username: t.authorUsername || social?.username || null,
        name: t.authorName || social?.name || null,
        providerUserId: social?.providerUserId || t.authorXUserId,
        followersCount: social?.followersCount || t.authorFollowers || 0,
        verified: social?.verified || t.authorVerified || false,
        walletAddress: t.user?.walletAddress || null,
        bestScore: score,
        qualityScore: t.score.qualityScore,
        engagementScore: t.score.engagementScore,
        trustMultiplier: t.score.trustMultiplier,
        tweetId: t.tweetId,
        tweetCount: existing ? existing.tweetCount + 1 : 1,
        engagementPending: t.status === "quality_scored",
      });
    } else if (existing) {
      existing.tweetCount++;
    }
  }

  const totalScore = Array.from(authorBest.values()).reduce((s, a) => s + a.bestScore, 0);
  const pool = config.daily_quota_pool;

  const sorted = Array.from(authorBest.values()).sort((a, b) => b.bestScore - a.bestScore);

  const participants = sorted.map((a, idx) => ({
    rank: idx + 1,
    twitter: {
      username: a.username,
      name: a.name,
      userId: a.providerUserId,
      followersCount: a.followersCount,
      verified: a.verified,
    },
    wallet: a.walletAddress,
    score: {
      best: Math.round(a.bestScore * 100) / 100,
      quality: Math.round(a.qualityScore * 100) / 100,
      engagement: Math.round(a.engagementScore * 100) / 100,
      trust: a.trustMultiplier,
      engagementPending: a.engagementPending,
      tweetId: a.tweetId,
      tweetCount: a.tweetCount,
    },
    mindsharePercent: totalScore > 0
      ? Math.round((a.bestScore / totalScore) * 10000) / 100
      : 0,
    quota: totalScore > 0
      ? Math.round((a.bestScore / totalScore) * pool)
      : 0,
  }));

  // Epoch number = total settled pools + 1 (current)
  const settledCount = await prisma.dailyQuotaPool.count({
    where: { status: { not: "open" } },
  });

  return NextResponse.json({
    epoch: {
      number: settledCount + 1,
      date: "current",
      status: "live",
      poolSize: pool,
      totalScore: Math.round(totalScore * 100) / 100,
      participantCount: sorted.length,
    },
    participants,
  });
}
