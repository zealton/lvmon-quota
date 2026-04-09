import { scoreEngagement, calculateTrustMultiplier, computeFinalScore } from "@/lib/scoring";

// Mock config for engagement tests
jest.mock("@/lib/config", () => ({
  getConfig: jest.fn().mockResolvedValue({
    engagement_like_weight: 1,
    engagement_reply_weight: 2,
    engagement_retweet_weight: 3,
    engagement_quote_weight: 4,
    engagement_log_multiplier: 12,
  }),
}));

describe("scoreEngagement", () => {
  it("returns 0 for zero engagement", async () => {
    const score = await scoreEngagement({ likeCount: 0, replyCount: 0, retweetCount: 0, quoteCount: 0 });
    expect(score).toBe(0);
  });

  it("calculates weighted engagement with likes only", async () => {
    const score = await scoreEngagement({ likeCount: 10, replyCount: 0, retweetCount: 0, quoteCount: 0 });
    // 12 * ln(1 + 10*1) = 12 * ln(11) ≈ 28.77
    expect(score).toBeCloseTo(12 * Math.log(11), 1);
  });

  it("weights quotes higher than likes", async () => {
    const likesOnly = await scoreEngagement({ likeCount: 4, replyCount: 0, retweetCount: 0, quoteCount: 0 });
    const quotesOnly = await scoreEngagement({ likeCount: 0, replyCount: 0, retweetCount: 0, quoteCount: 1 });
    // 4 likes = weight 4, 1 quote = weight 4 → same
    expect(likesOnly).toBeCloseTo(quotesOnly, 1);
  });

  it("caps at 60", async () => {
    const score = await scoreEngagement({ likeCount: 10000, replyCount: 5000, retweetCount: 2000, quoteCount: 1000 });
    expect(score).toBe(60);
  });

  it("uses log compression — diminishing returns", async () => {
    const score10 = await scoreEngagement({ likeCount: 10, replyCount: 0, retweetCount: 0, quoteCount: 0 });
    const score100 = await scoreEngagement({ likeCount: 100, replyCount: 0, retweetCount: 0, quoteCount: 0 });
    // 10x more likes should NOT give 10x more score
    expect(score100 / score10).toBeLessThan(2);
  });
});

describe("calculateTrustMultiplier", () => {
  it("returns 0 for banned user", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 365, followersCount: 1000, followingCount: 200, tweetCount: 500, isBanned: true,
    });
    expect(result.multiplier).toBe(0);
    expect(result.riskLevel).toBe("high");
    expect(result.reasons).toContain("user_banned");
  });

  it("returns 1.0 for clean established account", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 365, followersCount: 1000, followingCount: 200, tweetCount: 500, isBanned: false,
    });
    expect(result.multiplier).toBe(1.0);
    expect(result.riskLevel).toBe("none");
    expect(result.reasons).toHaveLength(0);
  });

  it("penalizes very new accounts (<14 days)", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 7, followersCount: 50, followingCount: 30, tweetCount: 20, isBanned: false,
    });
    expect(result.multiplier).toBeLessThan(1.0);
    expect(result.reasons).toContain("account_very_new");
  });

  it("penalizes new accounts (<30 days)", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 20, followersCount: 50, followingCount: 30, tweetCount: 20, isBanned: false,
    });
    expect(result.multiplier).toBe(0.75);
    expect(result.reasons).toContain("account_new");
  });

  it("penalizes very few followers", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 365, followersCount: 3, followingCount: 10, tweetCount: 50, isBanned: false,
    });
    expect(result.multiplier).toBe(0.75);
    expect(result.reasons).toContain("very_few_followers");
  });

  it("penalizes suspicious follow ratio", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 365, followersCount: 10, followingCount: 5000, tweetCount: 100, isBanned: false,
    });
    expect(result.multiplier).toBeLessThan(1.0);
    expect(result.reasons).toContain("suspicious_follow_ratio");
  });

  it("penalizes low followers with high tweets (bot pattern)", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 365, followersCount: 5, followingCount: 10, tweetCount: 1000, isBanned: false,
    });
    expect(result.reasons).toContain("low_followers_high_tweets");
  });

  it("stacks multiple risk signals — medium risk", () => {
    const result = calculateTrustMultiplier({
      accountAgeDays: 7, followersCount: 2, followingCount: 500, tweetCount: 1000, isBanned: false,
    });
    expect(result.multiplier).toBe(0.5);
    expect(result.riskLevel).toBe("medium");
  });
});

describe("computeFinalScore", () => {
  it("combines quality and engagement with trust", () => {
    expect(computeFinalScore(20, 30, 1.0)).toBe(50);
  });

  it("applies trust multiplier", () => {
    expect(computeFinalScore(20, 30, 0.5)).toBe(25);
  });

  it("caps at 100", () => {
    expect(computeFinalScore(40, 60, 1.0)).toBe(100);
    expect(computeFinalScore(40, 60, 1.5)).toBe(100); // even if trust > 1
  });

  it("returns 0 for banned user (trust=0)", () => {
    expect(computeFinalScore(40, 60, 0)).toBe(0);
  });

  it("handles zero scores", () => {
    expect(computeFinalScore(0, 0, 1.0)).toBe(0);
  });
});
