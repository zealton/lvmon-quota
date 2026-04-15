import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TweetStatus } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const socialAccount = await prisma.socialAccount.findFirst({
    where: { provider: "x", username },
    include: {
      user: {
        include: {
          creatorDailyStats: {
            orderBy: { statDate: "desc" },
            take: 30,
          },
          tweets: {
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
            orderBy: { createdAtX: "desc" },
            take: 50,
          },
        },
      },
    },
  });

  if (!socialAccount) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const user = socialAccount.user;

  // Get balance
  const lastLedger = await prisma.quotaLedgerEntry.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    username: socialAccount.username,
    name: socialAccount.name,
    avatarUrl: socialAccount.avatarUrl,
    followersCount: socialAccount.followersCount,
    accountCreatedAt: socialAccount.accountCreatedAt,
    verified: socialAccount.verified,
    currentBalance: lastLedger?.balanceAfter || 0,
    dailyStats: user.creatorDailyStats.map((s) => ({
      date: s.statDate,
      rank: s.rank,
      indexScore: s.indexScore,
      mindsharePercent: Math.round(s.mindsharePercent * 100) / 100,
      dailyReward: s.dailyReward,
      totalReward: s.totalReward,
    })),
    tweets: user.tweets.map((t) => {
      const isEngagementPending = t.status === "quality_scored";
      return {
        tweetId: t.tweetId,
        text: t.text,
        createdAt: t.createdAtX,
        hasMedia: t.hasMedia,
        status: t.status,
        score: t.score
          ? {
              quality: t.score.qualityScore,
              engagement: isEngagementPending ? null : t.score.engagementScore,
              trust: isEngagementPending ? null : t.score.trustMultiplier,
              final: t.score.finalScore,
              engagementPending: isEngagementPending,
            }
          : null,
        metrics: t.metricSnapshots[0]
          ? {
              likes: t.metricSnapshots[0].likeCount,
              replies: t.metricSnapshots[0].replyCount,
              retweets: t.metricSnapshots[0].retweetCount,
              quotes: t.metricSnapshots[0].quoteCount,
            }
          : null,
      };
    }),
  });
}
