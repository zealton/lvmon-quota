import { testPrisma, cleanDB, seedConfig, createUser, createSocialAccount, createScoredTweet, disconnectDB } from "./setup";

// Mock prisma to use test DB
jest.mock("@/lib/prisma", () => ({
  prisma: require("./setup").testPrisma,
}));

// Mock config to use test DB
jest.mock("@/lib/config", () => {
  const actual = jest.requireActual("@/lib/config");
  return {
    ...actual,
    getConfig: async () => {
      const { testPrisma } = require("./setup");
      const rows = await testPrisma.appConfig.findMany();
      const defaults = {
        daily_quota_pool: 1000,
        tweet_observation_window_hours: 0,
        max_tweets_per_user_per_day: 3,
        tweet_weight_1: 1.0,
        tweet_weight_2: 0.5,
        tweet_weight_3: 0.25,
        min_text_length: 40,
        similarity_threshold: 0.85,
        engagement_like_weight: 1,
        engagement_reply_weight: 2,
        engagement_retweet_weight: 3,
        engagement_quote_weight: 4,
        engagement_log_multiplier: 12,
        max_search_results: 20,
        search_handle: "@TestHandle",
      };
      for (const row of rows) {
        if (row.key in defaults) {
          (defaults as any)[row.key] = row.key === "search_handle" ? row.value : parseFloat(row.value);
        }
      }
      return defaults;
    },
  };
});

import { runDailySettlement } from "@/jobs/daily-settlement";

const TODAY = new Date("2026-04-09T00:00:00Z");
const SCORED_AT = new Date("2026-04-09T10:00:00Z");

beforeAll(async () => {
  await cleanDB();
});

afterEach(async () => {
  await cleanDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe("Daily Settlement", () => {
  beforeEach(async () => {
    await seedConfig();
  });

  it("distributes pool to 3 users proportionally", async () => {
    const user1 = await createUser({ displayName: "User1" });
    const user2 = await createUser({ displayName: "User2" });
    const user3 = await createUser({ displayName: "User3" });

    // User1: score 50, User2: score 30, User3: score 20
    await createScoredTweet({ userId: user1.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user2.id, authorXUserId: "x2", finalScore: 30, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user3.id, authorXUserId: "x3", finalScore: 20, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    expect(result.tweetsSettled).toBe(3);
    expect(result.participants).toBe(3);

    // Check quota sums to 1000
    const totalQuota = result.distribution!.reduce((s: number, d: any) => s + d.quota, 0);
    expect(totalQuota).toBe(1000);

    // Check proportional distribution (50/100, 30/100, 20/100)
    const d1 = result.distribution!.find((d: any) => d.key === user1.id);
    const d2 = result.distribution!.find((d: any) => d.key === user2.id);
    const d3 = result.distribution!.find((d: any) => d.key === user3.id);
    expect(d1!.quota).toBe(500);
    expect(d2!.quota).toBe(300);
    expect(d3!.quota).toBe(200);
  });

  it("single user gets entire pool", async () => {
    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 80, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    expect(result.distribution![0].quota).toBe(1000);
  });

  it("takes only top 3 tweets per user with diminishing weights", async () => {
    const user = await createUser();
    const authorXId = "x_multi";

    // 4 tweets with scores: 80, 60, 40, 20
    await createScoredTweet({ userId: user.id, authorXUserId: authorXId, finalScore: 80, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user.id, authorXUserId: authorXId, finalScore: 60, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user.id, authorXUserId: authorXId, finalScore: 40, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user.id, authorXUserId: authorXId, finalScore: 20, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    // Expected: 80×1.0 + 60×0.5 + 40×0.25 = 80 + 30 + 10 = 120
    // 4th tweet (20) should be ignored
    const userScore = await testPrisma.userDailyScore.findFirst({ where: { userId: user.id } });
    expect(userScore!.finalUserScore).toBe(120);
    expect(userScore!.score1).toBe(80);
    expect(userScore!.score2).toBe(60);
    expect(userScore!.score3).toBe(40);
  });

  it("returns empty pool when no scored tweets", async () => {
    const result = await runDailySettlement(TODAY);

    expect(result.message).toBe("No scored tweets");
    const pool = await testPrisma.dailyQuotaPool.findUnique({ where: { poolDate: TODAY } });
    expect(pool!.status).toBe("empty");
  });

  it("marks tweets as settled after distribution", async () => {
    const user = await createUser();
    const tweet = await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });

    await runDailySettlement(TODAY);

    const updated = await testPrisma.tweet.findUnique({ where: { id: tweet.id } });
    expect(updated!.status).toBe("settled");
  });

  it("creates ledger entries for bound users", async () => {
    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });

    await runDailySettlement(TODAY);

    const entries = await testPrisma.quotaLedgerEntry.findMany({ where: { userId: user.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe("issue");
    expect(entries[0].amount).toBe(1000); // single user gets all
    expect(entries[0].balanceAfter).toBe(1000);
  });

  it("skips ledger writes for unbound users (x: prefix)", async () => {
    // Create scored tweet without userId
    await createScoredTweet({ userId: null, authorXUserId: "unbound_author", finalScore: 50, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    expect(result.participants).toBe(1);
    expect(result.distribution![0].bound).toBe(false);

    // No ledger entries should exist
    const entries = await testPrisma.quotaLedgerEntry.findMany();
    expect(entries).toHaveLength(0);
  });

  it("handles mixed bound and unbound users", async () => {
    const boundUser = await createUser({ displayName: "Bound" });
    // Bound: score 60, Unbound: score 40 → total 100
    await createScoredTweet({ userId: boundUser.id, authorXUserId: "x_bound", finalScore: 60, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: null, authorXUserId: "x_unbound", finalScore: 40, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    // Both participate in score calculation
    expect(result.participants).toBe(2);

    // But only bound user gets ledger entry
    const entries = await testPrisma.quotaLedgerEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe(boundUser.id);
    // Bound user gets 60% of 1000 = 600
    expect(entries[0].amount).toBe(600);
  });

  it("allows re-settlement for the same date", async () => {
    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });

    // First settlement
    await runDailySettlement(TODAY);

    // Re-create scored tweet (first one was settled)
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 80, scoredAt: SCORED_AT });

    // Second settlement
    const result2 = await runDailySettlement(TODAY);

    expect(result2.tweetsSettled).toBeGreaterThan(0);
    const pool = await testPrisma.dailyQuotaPool.findUnique({ where: { poolDate: TODAY } });
    expect(pool!.status).toBe("settled");
  });

  it("creates creator daily stats with correct rank and mindshare", async () => {
    const user1 = await createUser({ displayName: "Big" });
    const user2 = await createUser({ displayName: "Small" });

    await createScoredTweet({ userId: user1.id, authorXUserId: "x1", finalScore: 75, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user2.id, authorXUserId: "x2", finalScore: 25, scoredAt: SCORED_AT });

    await runDailySettlement(TODAY);

    const stat1 = await testPrisma.creatorDailyStat.findFirst({ where: { userId: user1.id } });
    const stat2 = await testPrisma.creatorDailyStat.findFirst({ where: { userId: user2.id } });

    expect(stat1!.rank).toBe(1);
    expect(stat2!.rank).toBe(2);
    expect(stat1!.mindsharePercent).toBe(75);
    expect(stat2!.mindsharePercent).toBe(25);
    expect(stat1!.dailyReward).toBe(750);
    expect(stat2!.dailyReward).toBe(250);
  });

  it("accumulates totalReward across multiple days", async () => {
    const user = await createUser();
    const day1 = new Date("2026-04-08T00:00:00Z");
    const day2 = new Date("2026-04-09T00:00:00Z");

    // Day 1
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: new Date("2026-04-08T10:00:00Z") });
    await runDailySettlement(day1);

    // Day 2
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 60, scoredAt: SCORED_AT });
    await runDailySettlement(day2);

    const stats = await testPrisma.creatorDailyStat.findMany({
      where: { userId: user.id },
      orderBy: { statDate: "asc" },
    });

    expect(stats).toHaveLength(2);
    expect(stats[0].totalReward).toBe(1000); // Day 1: sole user gets all
    expect(stats[1].totalReward).toBe(2000); // Day 2: 1000 + 1000
  });

  it("ledger balanceAfter accumulates correctly", async () => {
    const user = await createUser();
    const day1 = new Date("2026-04-08T00:00:00Z");
    const day2 = new Date("2026-04-09T00:00:00Z");

    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: new Date("2026-04-08T10:00:00Z") });
    await runDailySettlement(day1);

    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 60, scoredAt: SCORED_AT });
    await runDailySettlement(day2);

    const entries = await testPrisma.quotaLedgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].balanceAfter).toBe(1000);
    expect(entries[1].balanceAfter).toBe(2000);
  });

  it("handles equal scores — splits evenly", async () => {
    const user1 = await createUser({ displayName: "A" });
    const user2 = await createUser({ displayName: "B" });

    await createScoredTweet({ userId: user1.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user2.id, authorXUserId: "x2", finalScore: 50, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    const total = result.distribution!.reduce((s: number, d: any) => s + d.quota, 0);
    expect(total).toBe(1000);
    // Each should get 500
    expect(result.distribution![0].quota).toBe(500);
    expect(result.distribution![1].quota).toBe(500);
  });

  it("respects custom daily_quota_pool config", async () => {
    await seedConfig({ daily_quota_pool: "5000" });

    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);

    expect(result.poolAmount).toBe(5000);
    expect(result.distribution![0].quota).toBe(5000);
  });
});
