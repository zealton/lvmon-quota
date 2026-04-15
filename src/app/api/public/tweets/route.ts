import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TweetStatus } from "@prisma/client";
import { getConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const mode = searchParams.get("mode") || "authors"; // "authors" or "tweets"

  if (mode === "tweets") {
    // Tweet-level listing — include quality_scored tweets so users see immediate feedback
    const statusFilter = { in: [TweetStatus.quality_scored, TweetStatus.scored] };
    const [tweets, total] = await Promise.all([
      prisma.tweet.findMany({
        where: {
          status: statusFilter,
          score: { isPublic: true },
        },
        include: {
          score: {
            select: {
              qualityScore: true,
              engagementScore: true,
              finalScore: true,
              scoredAt: true,
            },
          },
          metricSnapshots: {
            where: { snapshotType: "scoring" },
            take: 1,
          },
        },
        orderBy: { createdAtX: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tweet.count({
        where: {
          status: statusFilter,
          score: { isPublic: true },
        },
      }),
    ]);

    const items = tweets.map((t) => {
      const metrics = t.metricSnapshots[0];
      const isEngagementPending = t.status === "quality_scored";
      return {
        tweetId: t.tweetId,
        text: t.text,
        createdAt: t.createdAtX,
        hasMedia: t.hasMedia,
        isQuote: t.isQuote,
        status: t.status,
        author: {
          username: t.authorUsername || "unknown",
          name: t.authorName || "Unknown",
          avatarUrl: t.authorAvatarUrl || null,
        },
        score: t.score
          ? {
              quality: t.score.qualityScore,
              engagement: isEngagementPending ? null : t.score.engagementScore,
              final: t.score.finalScore,
              scoredAt: t.score.scoredAt,
              engagementPending: isEngagementPending,
            }
          : null,
        metrics: metrics
          ? {
              likes: metrics.likeCount,
              replies: metrics.replyCount,
              retweets: metrics.retweetCount,
              quotes: metrics.quoteCount,
            }
          : null,
      };
    });

    return NextResponse.json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  // Author-grouped mode: aggregate scores per author (current epoch only, not settled)
  const scoredTweets = await prisma.tweet.findMany({
    where: {
      status: { in: [TweetStatus.quality_scored, TweetStatus.scored] },
      score: { isPublic: true },
    },
    include: {
      score: true,
      metricSnapshots: {
        where: { snapshotType: "scoring" },
        take: 1,
      },
    },
    orderBy: { score: { finalScore: "desc" } },
  });

  // Group by author
  const authorMap = new Map<
    string,
    {
      authorXUserId: string;
      username: string;
      name: string;
      avatarUrl: string | null;
      totalScore: number;
      totalQuality: number;
      totalEngagement: number;
      bestScore: number;
      tweetCount: number;
      hasEngagementPending: boolean;
      totalLikes: number;
      totalRetweets: number;
      totalReplies: number;
      totalQuotes: number;
      tweets: {
        tweetId: string;
        text: string;
        createdAt: Date;
        hasMedia: boolean;
        score: number;
        quality: number;
        engagement: number;
        engagementPending: boolean;
        likes: number;
        retweets: number;
        replies: number;
        quotes: number;
      }[];
    }
  >();

  for (const t of scoredTweets) {
    const key = t.authorXUserId;
    const existing = authorMap.get(key);
    const metrics = t.metricSnapshots[0];
    const isEngPending = t.status === "quality_scored";
    const tweetData = {
      tweetId: t.tweetId,
      text: t.text,
      createdAt: t.createdAtX,
      hasMedia: t.hasMedia,
      score: t.score?.finalScore || 0,
      quality: t.score?.qualityScore || 0,
      engagement: isEngPending ? 0 : (t.score?.engagementScore || 0),
      engagementPending: isEngPending,
      likes: metrics?.likeCount || 0,
      retweets: metrics?.retweetCount || 0,
      replies: metrics?.replyCount || 0,
      quotes: metrics?.quoteCount || 0,
    };

    const scoreVal = t.score?.finalScore || 0;
    const qualityVal = t.score?.qualityScore || 0;
    const engagementVal = isEngPending ? 0 : (t.score?.engagementScore || 0);

    if (existing) {
      // Only the best tweet counts for score — replace if this one is better
      if (scoreVal > existing.bestScore) {
        existing.bestScore = scoreVal;
        existing.totalScore = scoreVal;
        existing.totalQuality = qualityVal;
        existing.totalEngagement = engagementVal;
        existing.hasEngagementPending = isEngPending;
      }
      existing.tweetCount++;
      existing.totalLikes += metrics?.likeCount || 0;
      existing.totalRetweets += metrics?.retweetCount || 0;
      existing.totalReplies += metrics?.replyCount || 0;
      existing.totalQuotes += metrics?.quoteCount || 0;
      existing.tweets.push(tweetData);
    } else {
      authorMap.set(key, {
        authorXUserId: key,
        username: t.authorUsername || "unknown",
        name: t.authorName || "Unknown",
        avatarUrl: t.authorAvatarUrl || null,
        totalScore: scoreVal,
        totalQuality: qualityVal,
        totalEngagement: engagementVal,
        bestScore: scoreVal,
        tweetCount: 1,
        hasEngagementPending: isEngPending,
        totalLikes: metrics?.likeCount || 0,
        totalRetweets: metrics?.retweetCount || 0,
        totalReplies: metrics?.replyCount || 0,
        totalQuotes: metrics?.quoteCount || 0,
        tweets: [tweetData],
      });
    }
  }

  // Sort by totalScore descending
  const sorted = Array.from(authorMap.values()).sort((a, b) => b.totalScore - a.totalScore);
  const totalAuthors = sorted.length;
  const totalScoreAll = sorted.reduce((s, a) => s + a.totalScore, 0);

  // Calculate quota allocation
  const config = await getConfig();
  const dailyPool = config.daily_quota_pool;

  // Get historical total rewards from settled pools (bound users)
  const allSettledIssuances = await prisma.quotaIssuance.findMany({
    include: { user: { include: { socialAccounts: { where: { provider: "x" }, select: { providerUserId: true }, take: 1 } } } },
  });
  const historicalRewardsByXId = new Map<string, number>();
  for (const iss of allSettledIssuances) {
    const xId = iss.user.socialAccounts[0]?.providerUserId;
    if (xId) {
      historicalRewardsByXId.set(xId, (historicalRewardsByXId.get(xId) || 0) + iss.quotaAmount);
    }
  }

  // Paginate
  const paged = sorted.slice((page - 1) * limit, page * limit);

  const items = paged.map((a, idx) => {
    const mindsharePercent = totalScoreAll > 0 ? Math.round((a.totalScore / totalScoreAll) * 10000) / 100 : 0;
    const dailyReward = totalScoreAll > 0 ? Math.round((a.totalScore / totalScoreAll) * dailyPool) : 0;

    return {
      rank: (page - 1) * limit + idx + 1,
      username: a.username,
      name: a.name,
      avatarUrl: a.avatarUrl,
      totalScore: Math.round(a.totalScore * 100) / 100,
      totalQuality: Math.round(a.totalQuality * 100) / 100,
      totalEngagement: Math.round(a.totalEngagement * 100) / 100,
      hasEngagementPending: a.hasEngagementPending,
      bestScore: Math.round(a.bestScore * 100) / 100,
      mindsharePercent,
      dailyReward,
      totalReward: (historicalRewardsByXId.get(a.authorXUserId) || 0) + dailyReward,
      tweetCount: a.tweetCount,
      totalLikes: a.totalLikes,
      totalRetweets: a.totalRetweets,
      totalReplies: a.totalReplies,
      totalQuotes: a.totalQuotes,
      tweets: a.tweets.sort((x, y) => y.score - x.score).slice(0, 10),
    };
  });

  return NextResponse.json({
    items,
    totalParticipants: totalAuthors,
    totalScore: Math.round(totalScoreAll * 100) / 100,
    dailyPool,
    epochDurationHours: config.epoch_duration_hours,
    pagination: { page, limit, total: totalAuthors, totalPages: Math.ceil(totalAuthors / limit) },
  });
}
