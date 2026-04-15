import { PrismaClient } from "@prisma/client";

export const testPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || "postgresql://lark@localhost:5432/lvmon_quota_test?schema=public",
});

export async function cleanDB() {
  // Use raw SQL to truncate all tables — avoids FK ordering issues
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE score_logs, quota_ledger, quota_issuances, creator_daily_stats,
      user_daily_scores, daily_quota_pools, moderation_actions, tweet_scores,
      tweet_metric_snapshots, tweets, social_accounts, users, job_runs, app_config
    CASCADE
  `);
}

export async function seedConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    search_handle: "@TestHandle",
    max_search_results: "20",
    daily_quota_pool: "1000",
    epoch_duration_hours: "24",
    tweet_observation_window_hours: "0",
    max_tweets_per_user_per_day: "1",
    tweet_weight_1: "1",
    tweet_weight_2: "0",
    tweet_weight_3: "0",
    min_text_length: "10",
    similarity_threshold: "0.85",
    engagement_like_weight: "1",
    engagement_reply_weight: "2",
    engagement_retweet_weight: "3",
    engagement_quote_weight: "4",
    engagement_log_multiplier: "12",
  };

  const merged = { ...defaults, ...overrides };

  for (const [key, value] of Object.entries(merged)) {
    await testPrisma.appConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

export async function createUser(data?: {
  displayName?: string;
  status?: "active" | "banned";
  role?: "user" | "admin";
  walletAddress?: string;
}) {
  return testPrisma.user.create({
    data: {
      displayName: data?.displayName || "Test User",
      status: data?.status || "active",
      role: data?.role || "user",
      walletAddress: data?.walletAddress || null,
    },
  });
}

export async function createSocialAccount(
  userId: string,
  data?: {
    providerUserId?: string;
    username?: string;
    followersCount?: number;
    followingCount?: number;
    tweetCount?: number;
    accountCreatedAt?: Date;
    verified?: boolean;
  }
) {
  return testPrisma.socialAccount.create({
    data: {
      userId,
      provider: "x",
      providerUserId: data?.providerUserId || `x_${Math.random().toString(36).slice(2)}`,
      username: data?.username || "testuser",
      followersCount: data?.followersCount ?? 1000,
      followingCount: data?.followingCount ?? 200,
      tweetCount: data?.tweetCount ?? 500,
      accountCreatedAt: data?.accountCreatedAt ?? new Date("2020-01-01"),
      verified: data?.verified ?? false,
    },
  });
}

export async function createTweet(data: {
  userId?: string | null;
  authorXUserId?: string;
  authorUsername?: string;
  text?: string;
  status?: "captured" | "eligible" | "quality_scored" | "scored" | "rejected" | "settled";
  createdAtX?: Date;
  hasMedia?: boolean;
  authorFollowers?: number;
  authorVerified?: boolean;
}) {
  const tweetId = `tweet_${Math.random().toString(36).slice(2)}`;
  return testPrisma.tweet.create({
    data: {
      tweetId,
      ...(data.userId ? { user: { connect: { id: data.userId } } } : {}),
      authorXUserId: data.authorXUserId || `author_${Math.random().toString(36).slice(2)}`,
      authorUsername: data.authorUsername || "testauthor",
      authorName: "Test Author",
      text: data.text || "This is a test tweet about @TestHandle with enough characters.",
      status: data.status || "eligible",
      createdAtX: data.createdAtX || new Date(),
      hasMedia: data.hasMedia || false,
      authorFollowers: data.authorFollowers || 0,
      authorVerified: data.authorVerified || false,
      isQuote: false,
      isReply: false,
      isRetweet: false,
    },
  });
}

export async function createScoredTweet(data: {
  userId?: string | null;
  authorXUserId?: string;
  finalScore: number;
  qualityScore?: number;
  engagementScore?: number;
  trustMultiplier?: number;
  scoredAt?: Date;
}) {
  const tweet = await createTweet({
    userId: data.userId,
    authorXUserId: data.authorXUserId,
    status: "scored",
    createdAtX: data.scoredAt, // align tweet publish time with scored time for epoch matching
  });

  const quality = data.qualityScore ?? 20;
  const engagement = data.engagementScore ?? (data.finalScore - quality);

  await testPrisma.tweetScore.create({
    data: {
      tweetId: tweet.id,
      qualityScore: quality,
      engagementScore: Math.max(0, engagement),
      trustMultiplier: data.trustMultiplier ?? 1.0,
      finalScore: data.finalScore,
      riskLevel: "none",
      scoredAt: data.scoredAt || new Date(),
    },
  });

  await testPrisma.tweetMetricSnapshot.create({
    data: {
      tweetId: tweet.id,
      snapshotType: "scoring",
      likeCount: 10,
      replyCount: 2,
      retweetCount: 1,
      quoteCount: 0,
    },
  });

  return tweet;
}

export async function disconnectDB() {
  await testPrisma.$disconnect();
}
