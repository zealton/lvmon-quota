import { testPrisma, cleanDB, seedConfig, createUser, createScoredTweet, disconnectDB } from "./setup";

jest.mock("@/lib/prisma", () => ({
  prisma: require("./setup").testPrisma,
}));

jest.mock("@/lib/config", () => ({
  getConfig: async () => {
    const { testPrisma } = require("./setup");
    const rows = await testPrisma.appConfig.findMany();
    const defaults: Record<string, any> = {
      daily_quota_pool: 1000,
      epoch_duration_hours: 24,
      tweet_observation_window_hours: 0,
      max_tweets_per_user_per_day: 1,
      tweet_weight_1: 1.0,
      tweet_weight_2: 0,
      tweet_weight_3: 0,
      min_text_length: 10,
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
}));

import { runDailySettlement } from "@/jobs/daily-settlement";

const TODAY = new Date("2026-04-09T00:00:00Z");
const SCORED_AT = new Date("2026-04-09T10:00:00Z");

beforeAll(async () => { await cleanDB(); });
afterEach(async () => { await cleanDB(); });
afterAll(async () => { await disconnectDB(); });

describe("Daily Settlement", () => {
  beforeEach(async () => { await seedConfig(); });

  it("distributes pool to 3 users proportionally", async () => {
    const u1 = await createUser({ displayName: "U1" });
    const u2 = await createUser({ displayName: "U2" });
    const u3 = await createUser({ displayName: "U3" });

    await createScoredTweet({ userId: u1.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: u2.id, authorXUserId: "x2", finalScore: 30, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: u3.id, authorXUserId: "x3", finalScore: 20, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);
    expect(result.tweetsSettled).toBe(3);
    expect(result.participants).toBe(3);
    const totalQuota = result.distribution!.reduce((s: number, d: any) => s + d.quota, 0);
    expect(totalQuota).toBe(1000);
  });

  it("single user gets entire pool", async () => {
    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 80, scoredAt: SCORED_AT });
    const result = await runDailySettlement(TODAY);
    expect(result.distribution![0].quota).toBe(1000);
  });

  it("best tweet only — only highest score counts per user", async () => {
    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "xa", finalScore: 80, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: user.id, authorXUserId: "xa", finalScore: 60, scoredAt: SCORED_AT });

    const result = await runDailySettlement(TODAY);
    const userScore = await testPrisma.userDailyScore.findFirst({ where: { userId: user.id } });
    expect(userScore!.finalUserScore).toBe(80);
    expect(userScore!.score1).toBe(80);
  });

  it("returns empty pool when no scored tweets", async () => {
    const result = await runDailySettlement(TODAY) as any;
    expect(result.message).toContain("No scored tweets");
  });

  it("marks tweets as settled", async () => {
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
    expect(entries[0].amount).toBe(1000);
  });

  it("skips ledger writes for unbound users", async () => {
    await createScoredTweet({ userId: null, authorXUserId: "unbound", finalScore: 50, scoredAt: SCORED_AT });
    const result = await runDailySettlement(TODAY);
    expect(result.distribution![0].bound).toBe(false);
    expect(await testPrisma.quotaLedgerEntry.count()).toBe(0);
  });

  it("handles mixed bound and unbound", async () => {
    const bound = await createUser();
    await createScoredTweet({ userId: bound.id, authorXUserId: "xb", finalScore: 60, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: null, authorXUserId: "xu", finalScore: 40, scoredAt: SCORED_AT });
    const result = await runDailySettlement(TODAY);
    expect(result.participants).toBe(2);
    const entries = await testPrisma.quotaLedgerEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(600);
  });

  it("creates creator stats with rank and mindshare", async () => {
    const u1 = await createUser({ displayName: "Big" });
    const u2 = await createUser({ displayName: "Small" });
    await createScoredTweet({ userId: u1.id, authorXUserId: "x1", finalScore: 75, scoredAt: SCORED_AT });
    await createScoredTweet({ userId: u2.id, authorXUserId: "x2", finalScore: 25, scoredAt: SCORED_AT });
    await runDailySettlement(TODAY);
    const s1 = await testPrisma.creatorDailyStat.findFirst({ where: { userId: u1.id } });
    expect(s1!.rank).toBe(1);
    expect(s1!.mindsharePercent).toBe(75);
  });

  it("respects custom pool size", async () => {
    await seedConfig({ daily_quota_pool: "5000" });
    const user = await createUser();
    await createScoredTweet({ userId: user.id, authorXUserId: "x1", finalScore: 50, scoredAt: SCORED_AT });
    const result = await runDailySettlement(TODAY);
    expect(result.poolAmount).toBe(5000);
  });
});
