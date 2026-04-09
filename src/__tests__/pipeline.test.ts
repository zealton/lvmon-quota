import { testPrisma, cleanDB, seedConfig, createUser, createScoredTweet, disconnectDB } from "./setup";

jest.mock("@/lib/prisma", () => ({
  prisma: require("./setup").testPrisma,
}));

jest.mock("@/lib/config", () => {
  const actual = jest.requireActual("@/lib/config");
  return {
    ...actual,
    getConfig: async () => {
      const { testPrisma } = require("./setup");
      const rows = await testPrisma.appConfig.findMany();
      const defaults: any = {
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
          defaults[row.key] = row.key === "search_handle" ? row.value : parseFloat(row.value);
        }
      }
      return defaults;
    },
    invalidateConfigCache: () => {},
  };
});

import { runDailySettlement } from "@/jobs/daily-settlement";
import { runQuotaExpiry } from "@/jobs/quota-expiry";

beforeAll(async () => {
  await cleanDB();
});

afterEach(async () => {
  await cleanDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe("Full Pipeline Integration", () => {
  beforeEach(async () => {
    await seedConfig();
  });

  it("end-to-end: score → settle → verify leaderboard data", async () => {
    const userA = await createUser({ displayName: "Alice" });
    const userB = await createUser({ displayName: "Bob" });

    const scoredAt = new Date("2026-04-09T10:00:00Z");
    const settleDate = new Date("2026-04-09T00:00:00Z");

    // Alice: 2 tweets (80, 40), Bob: 1 tweet (60)
    await createScoredTweet({ userId: userA.id, authorXUserId: "xa", finalScore: 80, scoredAt });
    await createScoredTweet({ userId: userA.id, authorXUserId: "xa", finalScore: 40, scoredAt });
    await createScoredTweet({ userId: userB.id, authorXUserId: "xb", finalScore: 60, scoredAt });

    const result = await runDailySettlement(settleDate);

    // Alice: 80×1.0 + 40×0.5 = 100
    // Bob: 60×1.0 = 60
    // Total: 160
    expect(result.totalScore).toBe(160);
    expect(result.participants).toBe(2);

    // Alice: 100/160 × 1000 = 625, Bob: 60/160 × 1000 = 375
    const dA = result.distribution!.find((d: any) => d.key === userA.id);
    const dB = result.distribution!.find((d: any) => d.key === userB.id);
    expect(dA!.quota + dB!.quota).toBe(1000);

    // Verify pool
    const pool = await testPrisma.dailyQuotaPool.findUnique({ where: { poolDate: settleDate } });
    expect(pool!.status).toBe("settled");
    expect(pool!.totalScore).toBe(160);

    // Verify creator stats
    const statA = await testPrisma.creatorDailyStat.findFirst({ where: { userId: userA.id } });
    expect(statA!.rank).toBeLessThan(3);
    expect(statA!.mindsharePercent).toBeCloseTo(62.5);

    // Verify tweets marked as settled
    const tweets = await testPrisma.tweet.findMany({ where: { status: "settled" } });
    expect(tweets).toHaveLength(3);
  });

  it("multi-day accumulation: day 1 + day 2", async () => {
    const user = await createUser({ displayName: "Consistent" });

    // Day 1: score 50
    await createScoredTweet({
      userId: user.id,
      authorXUserId: "x1",
      finalScore: 50,
      scoredAt: new Date("2026-04-08T10:00:00Z"),
    });
    await runDailySettlement(new Date("2026-04-08T00:00:00Z"));

    // Day 2: score 70
    await createScoredTweet({
      userId: user.id,
      authorXUserId: "x1",
      finalScore: 70,
      scoredAt: new Date("2026-04-09T10:00:00Z"),
    });
    await runDailySettlement(new Date("2026-04-09T00:00:00Z"));

    // Check ledger: two issue entries, balance = 2000
    const entries = await testPrisma.quotaLedgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].amount).toBe(1000);
    expect(entries[0].balanceAfter).toBe(1000);
    expect(entries[1].amount).toBe(1000);
    expect(entries[1].balanceAfter).toBe(2000);

    // Check creator stats
    const stats = await testPrisma.creatorDailyStat.findMany({
      where: { userId: user.id },
      orderBy: { statDate: "asc" },
    });
    expect(stats[0].totalReward).toBe(1000);
    expect(stats[1].totalReward).toBe(2000);
  });

  it("expiry flow: issue → wait → expire", async () => {
    const user = await createUser();

    // Create an issuance that expires in the past
    await testPrisma.quotaIssuance.create({
      data: {
        userId: user.id,
        poolDate: new Date("2026-03-20"),
        issuanceWeekStart: new Date("2026-03-16"),
        expiresAt: new Date("2026-03-30"), // already expired
        quotaAmount: 500,
        sourceUserScore: 50,
        sourceTotalScore: 100,
      },
    });

    // Create matching ledger entry
    await testPrisma.quotaLedgerEntry.create({
      data: {
        userId: user.id,
        entryType: "issue",
        amount: 500,
        balanceAfter: 500,
        referenceType: "quota_issuance",
        referenceId: "2026-03-20",
      },
    });

    // Run expiry
    const expiryResult = await runQuotaExpiry();

    expect(expiryResult.expiredCount).toBe(1);
    expect(expiryResult.totalExpired).toBe(500);

    // Balance should be 0
    const lastEntry = await testPrisma.quotaLedgerEntry.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(lastEntry!.entryType).toBe("expire");
    expect(lastEntry!.balanceAfter).toBe(0);
  });

  it("config change: different pool size between days", async () => {
    const user = await createUser();

    // Day 1: pool = 1000
    await createScoredTweet({
      userId: user.id,
      authorXUserId: "x1",
      finalScore: 50,
      scoredAt: new Date("2026-04-08T10:00:00Z"),
    });
    await runDailySettlement(new Date("2026-04-08T00:00:00Z"));

    // Change pool to 5000
    await testPrisma.appConfig.upsert({
      where: { key: "daily_quota_pool" },
      update: { value: "5000" },
      create: { key: "daily_quota_pool", value: "5000" },
    });

    // Day 2: pool = 5000
    await createScoredTweet({
      userId: user.id,
      authorXUserId: "x1",
      finalScore: 60,
      scoredAt: new Date("2026-04-09T10:00:00Z"),
    });
    const result2 = await runDailySettlement(new Date("2026-04-09T00:00:00Z"));

    expect(result2.poolAmount).toBe(5000);
    expect(result2.distribution![0].quota).toBe(5000);

    // Total across 2 days: 1000 + 5000 = 6000
    const lastEntry = await testPrisma.quotaLedgerEntry.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(lastEntry!.balanceAfter).toBe(6000);
  });

  it("whale vs minnow: high score user dominates but doesn't take 100%", async () => {
    const whale = await createUser({ displayName: "Whale" });
    const minnow = await createUser({ displayName: "Minnow" });
    const scoredAt = new Date("2026-04-09T10:00:00Z");

    // Whale: score 95 (near max), Minnow: score 5
    await createScoredTweet({ userId: whale.id, authorXUserId: "xw", finalScore: 95, scoredAt });
    await createScoredTweet({ userId: minnow.id, authorXUserId: "xm", finalScore: 5, scoredAt });

    const result = await runDailySettlement(new Date("2026-04-09T00:00:00Z"));

    const dWhale = result.distribution!.find((d: any) => d.key === whale.id);
    const dMinnow = result.distribution!.find((d: any) => d.key === minnow.id);

    // Whale gets 95%, Minnow gets 5%
    expect(dWhale!.quota).toBe(950);
    expect(dMinnow!.quota).toBe(50);
    expect(dWhale!.quota + dMinnow!.quota).toBe(1000);
  });

  it("many participants: 20 users with equal scores", async () => {
    const scoredAt = new Date("2026-04-09T10:00:00Z");

    for (let i = 0; i < 20; i++) {
      const user = await createUser({ displayName: `User${i}` });
      await createScoredTweet({ userId: user.id, authorXUserId: `x${i}`, finalScore: 50, scoredAt });
    }

    const result = await runDailySettlement(new Date("2026-04-09T00:00:00Z"));

    expect(result.participants).toBe(20);

    const total = result.distribution!.reduce((s: number, d: any) => s + d.quota, 0);
    expect(total).toBe(1000);

    // Each should get 50 (1000/20)
    for (const d of result.distribution!) {
      expect((d as any).quota).toBe(50);
    }
  });

  it("score 0 user gets 0 quota", async () => {
    const goodUser = await createUser({ displayName: "Good" });
    const zeroUser = await createUser({ displayName: "Zero" });
    const scoredAt = new Date("2026-04-09T10:00:00Z");

    await createScoredTweet({ userId: goodUser.id, authorXUserId: "xg", finalScore: 80, scoredAt });
    // Zero user has a scored tweet but finalScore = 0 (e.g., banned, trust=0)
    await createScoredTweet({ userId: zeroUser.id, authorXUserId: "xz", finalScore: 0, scoredAt });

    const result = await runDailySettlement(new Date("2026-04-09T00:00:00Z"));

    // Zero-score user might not appear in distribution (0 quota filtered out)
    // or appears with quota=0
    const dZero = result.distribution!.find((d: any) => d.key === zeroUser.id);
    if (dZero) {
      expect(dZero.quota).toBe(0);
    }

    // Good user gets all 1000
    const dGood = result.distribution!.find((d: any) => d.key === goodUser.id);
    expect(dGood!.quota).toBe(1000);

    // No ledger entry for zero-quota user
    const entries = await testPrisma.quotaLedgerEntry.findMany({ where: { userId: zeroUser.id } });
    expect(entries).toHaveLength(0);
  });
});
