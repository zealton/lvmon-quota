import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { getIssuanceWeekStart, getExpiresAt, largestRemainderDistribution } from "@/lib/quota";
import { subDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "Asia/Shanghai";

export async function runDailySettlement(targetDate?: Date) {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: "daily-settlement", status: "running" },
  });

  try {
    const config = await getConfig();
    const now = toZonedTime(new Date(), TZ);
    const epochMs = config.epoch_duration_hours * 60 * 60 * 1000;

    // Calculate the previous epoch's time range
    // Current epoch start = floor(now / epochDuration) * epochDuration
    const cstOffset = 8 * 60 * 60 * 1000;
    const nowMs = new Date().getTime() + cstOffset;
    const currentEpochStartCST = Math.floor(nowMs / epochMs) * epochMs;
    const prevEpochStartCST = currentEpochStartCST - epochMs;
    const settleDate = targetDate || new Date(prevEpochStartCST - cstOffset);

    // Check if already settled
    const existingPool = await prisma.dailyQuotaPool.findUnique({
      where: { poolDate: settleDate },
    });
    if (existingPool?.status === "settled") {
      await prisma.dailyQuotaPool.delete({ where: { poolDate: settleDate } });
    }

    // Get scored tweets from the settlement epoch
    const dayStart = settleDate;
    const dayEnd = new Date(settleDate.getTime() + epochMs);

    // Primary: tweets from this epoch window
    // Fallback: also include orphaned scored tweets from before this epoch
    // that were never settled (e.g. scored after their epoch already settled)
    // Fetch tweets from this epoch window
    const epochTweets = await prisma.tweet.findMany({
      where: {
        status: "scored",
        createdAtX: { gte: dayStart, lt: dayEnd },
      },
      include: { score: true },
    });

    // Also pick up orphaned scored tweets from earlier that missed their epoch
    const orphanedTweets = await prisma.tweet.findMany({
      where: {
        status: "scored",
        createdAtX: { lt: dayStart },
      },
      include: { score: true },
    });

    const scoredTweets = [...epochTweets, ...orphanedTweets];

    if (scoredTweets.length === 0) {
      await prisma.dailyQuotaPool.upsert({
        where: { poolDate: settleDate },
        update: { status: "empty", totalScore: 0 },
        create: {
          poolDate: settleDate,
          quotaAmount: config.daily_quota_pool,
          totalScore: 0,
          status: "empty",
        },
      });

      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: "completed",
          endedAt: new Date(),
          result: { message: "No scored tweets, pool empty" },
        },
      });
      return { message: "No scored tweets" };
    }

    // Group by user (use authorXUserId as fallback key for unbound users)
    const userTweets = new Map<string, { tweetId: string; score: number }[]>();
    // Track which keys are real user IDs vs X author IDs
    const keyIsRealUser = new Map<string, boolean>();

    for (const tweet of scoredTweets) {
      if (!tweet.score) continue;
      const isReal = !!tweet.userId;
      const key = tweet.userId || `x:${tweet.authorXUserId}`;
      keyIsRealUser.set(key, isReal);
      const list = userTweets.get(key) || [];
      list.push({ tweetId: tweet.id, score: tweet.score.finalScore });
      userTweets.set(key, list);
    }

    // Calculate user daily scores
    const weights = [config.tweet_weight_1, config.tweet_weight_2, config.tweet_weight_3];
    const userScores: { userId: string; finalScore: number; tweetIds: string[]; isRealUser: boolean }[] = [];

    for (const [userId, tweets] of userTweets) {
      const sorted = tweets.sort((a, b) => b.score - a.score).slice(0, config.max_tweets_per_user_per_day);

      let finalUserScore = 0;
      const scores: (number | null)[] = [null, null, null];
      const tweetIds: string[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const weight = weights[i] || 0;
        finalUserScore += sorted[i].score * weight;
        scores[i] = sorted[i].score;
        tweetIds.push(sorted[i].tweetId);
      }

      const isReal = keyIsRealUser.get(userId) || false;

      // Only write to DB if real user
      if (isReal) {
        await prisma.userDailyScore.upsert({
          where: {
            userId_scoreDate: { userId, scoreDate: settleDate },
          },
          update: {
            tweetCountEligible: sorted.length,
            tweetIds,
            score1: scores[0],
            score2: scores[1],
            score3: scores[2],
            finalUserScore,
          },
          create: {
            userId,
            scoreDate: settleDate,
            tweetCountEligible: sorted.length,
            tweetIds,
            score1: scores[0],
            score2: scores[1],
            score3: scores[2],
            finalUserScore,
          },
        });
      }

      userScores.push({ userId, finalScore: finalUserScore, tweetIds, isRealUser: isReal });
    }

    // Calculate total score
    const totalScore = userScores.reduce((sum, u) => sum + u.finalScore, 0);

    // Distribute quota
    const pool = config.daily_quota_pool;
    const distribution = largestRemainderDistribution(
      userScores.map((u) => ({ userId: u.userId, rawAmount: u.finalScore })),
      pool
    );

    // Week calculations
    const weekStart = getIssuanceWeekStart(settleDate);
    const expiresAt = getExpiresAt(weekStart);

    // Write issuances and ledger entries (only for real users)
    let usersRewarded = 0;
    for (const dist of distribution) {
      if (dist.amount <= 0) continue;
      usersRewarded++;

      const userScore = userScores.find((u) => u.userId === dist.userId)!;

      // Skip DB writes for unbound users (x:xxx keys)
      if (!userScore.isRealUser) continue;

      await prisma.quotaIssuance.upsert({
        where: {
          userId_poolDate: { userId: dist.userId, poolDate: settleDate },
        },
        update: {
          quotaAmount: dist.amount,
          sourceUserScore: userScore.finalScore,
          sourceTotalScore: totalScore,
        },
        create: {
          userId: dist.userId,
          poolDate: settleDate,
          issuanceWeekStart: weekStart,
          expiresAt,
          quotaAmount: dist.amount,
          sourceUserScore: userScore.finalScore,
          sourceTotalScore: totalScore,
        },
      });

      const lastEntry = await prisma.quotaLedgerEntry.findFirst({
        where: { userId: dist.userId },
        orderBy: { createdAt: "desc" },
      });
      const currentBalance = lastEntry?.balanceAfter || 0;

      await prisma.quotaLedgerEntry.create({
        data: {
          userId: dist.userId,
          entryType: "issue",
          amount: dist.amount,
          balanceAfter: currentBalance + dist.amount,
          referenceType: "quota_issuance",
          referenceId: `${settleDate.toISOString().split("T")[0]}`,
        },
      });

      const rank =
        distribution
          .sort((a, b) => b.amount - a.amount)
          .findIndex((d) => d.userId === dist.userId) + 1;

      const prevStat = await prisma.creatorDailyStat.findFirst({
        where: { userId: dist.userId },
        orderBy: { statDate: "desc" },
      });
      const prevTotal = prevStat?.totalReward || 0;

      await prisma.creatorDailyStat.upsert({
        where: {
          userId_statDate: { userId: dist.userId, statDate: settleDate },
        },
        update: {
          rank,
          indexScore: userScore.finalScore,
          mindsharePercent: totalScore > 0 ? (userScore.finalScore / totalScore) * 100 : 0,
          dailyReward: dist.amount,
          dailyRewardDelta: dist.amount - (prevStat?.dailyReward || 0),
          totalReward: prevTotal + dist.amount,
        },
        create: {
          userId: dist.userId,
          statDate: settleDate,
          rank,
          indexScore: userScore.finalScore,
          mindsharePercent: totalScore > 0 ? (userScore.finalScore / totalScore) * 100 : 0,
          dailyReward: dist.amount,
          dailyRewardDelta: dist.amount,
          totalReward: prevTotal + dist.amount,
        },
      });
    }

    // Mark tweets as settled
    for (const userScore of userScores) {
      await prisma.tweet.updateMany({
        where: { id: { in: userScore.tweetIds } },
        data: { status: "settled" },
      });
    }

    // Update pool
    await prisma.dailyQuotaPool.upsert({
      where: { poolDate: settleDate },
      update: { totalScore, status: "settled" },
      create: {
        poolDate: settleDate,
        quotaAmount: pool,
        totalScore,
        status: "settled",
      },
    });

    // Build distribution summary for result
    const distSummary = distribution
      .filter((d) => d.amount > 0)
      .map((d) => {
        const us = userScores.find((u) => u.userId === d.userId)!;
        return {
          key: d.userId,
          score: Math.round(us.finalScore * 100) / 100,
          quota: d.amount,
          bound: us.isRealUser,
        };
      });

    const result = {
      date: settleDate.toISOString().split("T")[0],
      tweetsSettled: scoredTweets.length,
      participants: userScores.length,
      usersRewarded,
      totalScore: Math.round(totalScore * 100) / 100,
      poolAmount: pool,
      distribution: distSummary,
    };

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "completed", endedAt: new Date(), result },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "failed", endedAt: new Date(), error: message },
    });
    throw error;
  }
}
