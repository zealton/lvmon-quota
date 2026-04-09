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

    // Find tweets ready to score
    const tweets = await prisma.tweet.findMany({
      where: {
        status: "eligible",
        createdAtX: { lte: cutoff },
      },
      include: {
        user: {
          include: {
            socialAccounts: { where: { provider: "x" }, take: 1 },
          },
        },
      },
      take: 50, // batch size
    });

    const client = getBearerClient();
    let scored = 0;
    let rejected = 0;

    for (const tweet of tweets) {
      try {
        // Refresh metrics
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

        // Check for user ban (skip user check if unbound — allows testing)
        const user = tweet.user;
        if (user && user.status === "banned") {
          await prisma.tweet.update({
            where: { id: tweet.id },
            data: { status: "rejected" },
          });
          rejected++;
          continue;
        }

        // Quality score via LLM
        const quality = await scoreQuality(tweet.text, tweet.hasMedia);

        // Engagement score
        const engagementScore = await scoreEngagement(metrics);

        // Trust multiplier
        const socialAccount = user?.socialAccounts?.[0];
        const accountAgeDays = socialAccount?.accountCreatedAt
          ? Math.floor(
              (Date.now() - socialAccount.accountCreatedAt.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 365; // Default to old if unknown

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

        // Check for duplicates from same user
        const duplicate = await prisma.tweetScore.findFirst({
          where: {
            similarityHash: simHash,
            tweet: { userId: tweet.userId },
          },
        });

        if (duplicate) {
          await prisma.tweet.update({
            where: { id: tweet.id },
            data: { status: "rejected" },
          });
          rejected++;
          continue;
        }

        const finalScore = computeFinalScore(
          quality.totalQuality,
          engagementScore,
          trust.multiplier
        );

        // Create score record
        await prisma.tweetScore.create({
          data: {
            tweetId: tweet.id,
            qualityScore: quality.totalQuality,
            engagementScore,
            trustMultiplier: trust.multiplier,
            finalScore,
            riskLevel: trust.riskLevel,
            riskReasons: trust.reasons,
            similarityHash: simHash,
            scoringVersion: "v1",
            isPublic: trust.riskLevel !== "high",
            relevanceSubscore: quality.relevanceSubscore,
            originalitySubscore: quality.originalitySubscore,
            formatSubscore: quality.formatSubscore,
          },
        });

        await prisma.tweet.update({
          where: { id: tweet.id },
          data: { status: "scored" },
        });

        scored++;
      } catch (err) {
        console.error(`Error scoring tweet ${tweet.tweetId}:`, err);
      }
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "completed",
        endedAt: new Date(),
        result: { scored, rejected, total: tweets.length },
      },
    });

    return { scored, rejected, total: tweets.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "failed", endedAt: new Date(), error: message },
    });
    throw error;
  }
}
