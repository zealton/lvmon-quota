import { largestRemainderDistribution, getIssuanceWeekStart, getExpiresAt } from "@/lib/quota";

describe("largestRemainderDistribution", () => {
  it("distributes proportionally for 2 users", () => {
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 70 },
        { userId: "b", rawAmount: 30 },
      ],
      1000
    );
    expect(result.find((r) => r.userId === "a")!.amount).toBe(700);
    expect(result.find((r) => r.userId === "b")!.amount).toBe(300);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(1000);
  });

  it("single user gets entire pool", () => {
    const result = largestRemainderDistribution(
      [{ userId: "a", rawAmount: 50 }],
      1000
    );
    expect(result[0].amount).toBe(1000);
  });

  it("handles rounding — 3 users splitting 10", () => {
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 1 },
        { userId: "b", rawAmount: 1 },
        { userId: "c", rawAmount: 1 },
      ],
      10
    );
    // 10/3 = 3.333... → two users get 4, one gets 3 (or similar)
    const sum = result.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(10); // MUST sum to pool exactly
    expect(result.every((r) => r.amount >= 3 && r.amount <= 4)).toBe(true);
  });

  it("handles many users with small shares", () => {
    const shares = Array.from({ length: 100 }, (_, i) => ({
      userId: `user_${i}`,
      rawAmount: 1,
    }));
    const result = largestRemainderDistribution(shares, 1000);
    const sum = result.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(1000);
    // Each should get 10
    expect(result.every((r) => r.amount === 10)).toBe(true);
  });

  it("returns zero amounts for zero total score", () => {
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 0 },
        { userId: "b", rawAmount: 0 },
      ],
      1000
    );
    expect(result.every((r) => r.amount === 0)).toBe(true);
  });

  it("returns empty for empty shares", () => {
    const result = largestRemainderDistribution([], 1000);
    expect(result).toHaveLength(0);
  });

  it("handles unequal scores with remainder", () => {
    // 60% and 40% of 7 → 4.2 and 2.8 → 4 and 3
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 60 },
        { userId: "b", rawAmount: 40 },
      ],
      7
    );
    const sum = result.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(7);
  });

  it("gives remainder to user with highest decimal", () => {
    // 1/3 pool = 333.33, remainder goes to one user
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 1 },
        { userId: "b", rawAmount: 1 },
        { userId: "c", rawAmount: 1 },
      ],
      1000
    );
    const sum = result.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(1000);
    // One user gets 334, two get 333
    const counts = result.map((r) => r.amount).sort();
    expect(counts).toEqual([333, 333, 334]);
  });

  it("handles very large pool", () => {
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 1 },
        { userId: "b", rawAmount: 2 },
      ],
      1_000_000
    );
    const sum = result.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(1_000_000);
    expect(result.find((r) => r.userId === "a")!.amount).toBeCloseTo(333333, -1);
    expect(result.find((r) => r.userId === "b")!.amount).toBeCloseTo(666667, -1);
  });

  it("handles one user with 0 score among others", () => {
    const result = largestRemainderDistribution(
      [
        { userId: "a", rawAmount: 100 },
        { userId: "b", rawAmount: 0 },
      ],
      1000
    );
    expect(result.find((r) => r.userId === "a")!.amount).toBe(1000);
    expect(result.find((r) => r.userId === "b")!.amount).toBe(0);
  });
});

describe("getIssuanceWeekStart", () => {
  it("returns Monday for a Wednesday", () => {
    // 2026-04-08 is a Wednesday
    const result = getIssuanceWeekStart(new Date("2026-04-08T12:00:00Z"));
    expect(result.getDay()).toBe(1); // Monday
  });

  it("returns same Monday for a Monday", () => {
    // 2026-04-06 is a Monday
    const result = getIssuanceWeekStart(new Date("2026-04-06T12:00:00Z"));
    expect(result.getDay()).toBe(1);
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-04-12 is a Sunday
    const result = getIssuanceWeekStart(new Date("2026-04-12T12:00:00Z"));
    expect(result.getDay()).toBe(1);
    // Should be April 6
    expect(result.getDate()).toBe(6);
  });
});

describe("getExpiresAt", () => {
  it("returns 2 weeks after issuance week start", () => {
    const weekStart = new Date("2026-04-06"); // Monday
    const expires = getExpiresAt(weekStart);
    // Should be April 20 (2 weeks later)
    expect(expires.getDate()).toBe(20);
    expect(expires.getMonth()).toBe(3); // April = 3
  });
});
