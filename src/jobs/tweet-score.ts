import { prisma } from "@/lib/prisma";
import { getBearerClient } from "@/lib/twitter";
import { scoreQuality, scoreEngagement, calculateTrustMultiplier, computeFinalScore } from "@/lib/scoring";
import { getConfig } from "@/lib/config";
import crypto from "crypto";

export async function runTweetScore() {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: "tweet-score", status: "running" },
  });

  try {
    const config = await getConfig();
    const windowMs = config.tweet_observation_window_hours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    // Current epoch = today in CST
    const cstOffset = 8 * 60 * 60 * 1000;
    const nowCST = new Date(Date.now() + cstOffset);
    const epochStart = new Date(nowCST);
    epochStart.setUTCHours(0, 0, 0, 0);
    const epochStartUTC = new Date(epochStart.getTime() - cstOffset);

    const client = getBearerClient();
    let scored = 0;
    let updated = 0;
    let rejected = 0;
    let totalProcessed = 0;
    const BATCH_SIZE = 50;

    // Process in batches until all tweets are done
    // Three categories:
    // 1. quality_scored past observation window → first-time engagement scoring
    // 2. eligible past observation window → legacy, full scoring
    // 3. scored but not settled → re-evaluate engagement with latest metrics
    const processedIds = new Set<string>();
    let hasMore = true;
    while (hasMore) {
      const tweets = await prisma.tweet.findMany({
        where: {
          id: { notIn: Array.from(processedIds) },
          OR: [
            { status: "quality_scored", createdAtX: { lte: cutoff } },
            { status: "eligible", createdAtX: { lte: cutoff } },
            { status: "scored" }, // re-evaluate all unsettled scored tweets
          ],
        },
        include: {
          score: true,
          user: {
            include: {
              socialAccounts: { where: { provider: "x" }, take: 1 },
            },
          },
        },
        take: BATCH_SIZE,
      });

      if (tweets.length === 0) {
        hasMore = false;
        break;
      }

      for (const t of tweets) processedIds.add(t.id);

    for (const tweet of tweets) {
      try {
        // Refresh metrics from Twitter API
        let metrics = {
          likeCount: 0,
          replyCount: 0,
          retweetCount: 0,
          quoteCount: 0,
        };

        try {
          const fresh = await client.v2.singleTweet(tweet.tweetId, {
            "tweet.fields": "public_metrics",
          });
          const pm = fresh.data?.public_metrics;
          if (pm) {
            metrics = {
              likeCount: pm.like_count || 0,
              replyCount: pm.reply_count || 0,
              retweetCount: pm.retweet_count || 0,
              quoteCount: pm.quote_count || 0,
            };
          }
        } catch {
          // If tweet lookup fails, use captured metrics
          const captureSnap = await prisma.tweetMetricSnapshot.findFirst({
            where: { tweetId: tweet.id, snapshotType: "capture" },
          });
          if (captureSnap) {
            metrics = {
              likeCount: captureSnap.likeCount,
              replyCount: captureSnap.replyCount,
              retweetCount: captureSnap.retweetCount,
              quoteCount: captureSnap.quoteCount,
            };
          }
        }

        // Save scoring snapshot
        await prisma.tweetMetricSnapshot.create({
          data: {
            tweetId: tweet.id,
            snapshotType: "scoring",
            ...metrics,
          },
        });

        // Check for user ban
        const user = tweet.user;
        if (user && user.status === "banned") {
          await prisma.tweet.update({
            where: { id: tweet.id },
            data: { status: "rejected" },
          });
          if (tweet.score) {
            await prisma.tweetScore.delete({ where: { id: tweet.score.id } });
          }
          rejected++;
          continue;
        }

        // If quality was already scored in ingest (quality_scored status), reuse it
        // Otherwise score quality now (legacy eligible tweets)
        let qualityScore: number;
        let relevanceSubscore: number;
        let originalitySubscore: number;
        let formatSubscore: number;

        if (tweet.score) {
          // Reuse existing quality score — never re-evaluate via LLM
          qualityScore = tweet.score.qualityScore;
          relevanceSubscore = tweet.score.relevanceSubscore || 0;
          originalitySubscore = tweet.score.originalitySubscore || 0;
          formatSubscore = tweet.score.formatSubscore || 0;
        } else {
          const quality = await scoreQuality(tweet.text, tweet.hasMedia);
          qualityScore = quality.totalQuality;
          relevanceSubscore = quality.relevanceSubscore;
          originalitySubscore = quality.originalitySubscore;
          formatSubscore = quality.formatSubscore;
        }

        // Engagement score
        const engagementScore = await scoreEngagement(metrics);

        // Trust multiplier
        const socialAccount = user?.socialAccounts?.[0];
        const accountAgeDays = socialAccount?.accountCreatedAt
          ? Math.floor(
              (Date.now() - socialAccount.accountCreatedAt.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 365;

        const trust = calculateTrustMultiplier({
          accountAgeDays,
          followersCount: socialAccount?.followersCount || 0,
          followingCount: socialAccount?.followingCount || 0,
          tweetCount: socialAccount?.tweetCount || 0,
          isBanned: user ? (user.status as string) === "banned" : false,
        });

        // Similarity hash for duplicate detection
        const simHash = crypto
          .createHash("md5")
          .update(tweet.text.toLowerCase().replace(/\s+/g, " ").trim())
          .digest("hex");

        // Check for duplicates from same user (exclude self)
        const duplicate = await prisma.tweetScore.findFirst({
          where: {
            similarityHash: simHash,
            tweet: { userId: tweet.userId },
            tweetId: { not: tweet.id },
          },
        });

        if (duplicate) {
          await prisma.tweet.update({
            where: { id: tweet.id },
            data: { status: "rejected" },
          });
          if (tweet.score) {
            await prisma.tweetScore.delete({ where: { id: tweet.score.id } });
          }
          rejected++;
          continue;
        }

        const finalScore = computeFinalScore(qualityScore, engagementScore, trust.multiplier);

        // Persist score change log
        const prevFinal = tweet.score?.finalScore || 0;
        const prevEngagement = tweet.score?.engagementScore || 0;
        const delta = finalScore - prevFinal;
        const isUpdate = tweet.status === "scored";

        if (!isUpdate || delta !== 0) {
          await prisma.scoreLog.create({
            data: {
              tweetId: tweet.tweetId,
              authorUsername: tweet.authorUsername,
              logType: isUpdate ? "update" : "new",
              qualityScore,
              engagementPrev: prevEngagement,
              engagementNew: engagementScore,
              finalPrev: prevFinal,
              finalNew: finalScore,
              delta,
              trustMultiplier: trust.multiplier,
            },
          });
        }

        // Upsert score record (may already exist from phase 1 quality scoring)
        if (tweet.score) {
          await prisma.tweetScore.update({
            where: { id: tweet.score.id },
            data: {
              engagementScore,
              trustMultiplier: trust.multiplier,
              finalScore,
              riskLevel: trust.riskLevel,
              riskReasons: trust.reasons,
              similarityHash: simHash,
              isPublic: trust.riskLevel !== "high",
              scoredAt: new Date(),
            },
          });
        } else {
          await prisma.tweetScore.create({
            data: {
              tweetId: tweet.id,
              qualityScore,
              engagementScore,
              trustMultiplier: trust.multiplier,
              finalScore,
              riskLevel: trust.riskLevel,
              riskReasons: trust.reasons,
              similarityHash: simHash,
              scoringVersion: "v1",
              isPublic: trust.riskLevel !== "high",
              relevanceSubscore,
              originalitySubscore,
              formatSubscore,
            },
          });
        }

        const wasAlreadyScored = tweet.status === "scored";

        await prisma.tweet.update({
          where: { id: tweet.id },
          data: { status: "scored" },
        });

        if (wasAlreadyScored) {
          updated++;
        } else {
          scored++;
        }
      } catch (err) {
        console.error(`Error scoring tweet ${tweet.tweetId}:`, err);
      }
    }

      totalProcessed += tweets.length;
      if (tweets.length < BATCH_SIZE) hasMore = false;
    } // end while

    // Clean up old score logs (keep last 7 days)
    const logCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { count: logsDeleted } = await prisma.scoreLog.deleteMany({
      where: { createdAt: { lt: logCutoff } },
    });

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "completed",
        endedAt: new Date(),
        result: { scored, updated, rejected, total: totalProcessed, logsDeleted },
      },
    });

    return { scored, updated, rejected, total: totalProcessed, logsDeleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "failed", endedAt: new Date(), error: message },
    });
    throw error;
  }
}
