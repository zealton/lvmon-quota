import { testPrisma, cleanDB, seedConfig, createUser, disconnectDB } from "./setup";

jest.mock("@/lib/prisma", () => ({
  prisma: require("./setup").testPrisma,
}));

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

async function createIssuanceWithLedger(userId: string, data: {
  poolDate: Date;
  issuanceWeekStart: Date;
  expiresAt: Date;
  quotaAmount: number;
}) {
  const issuance = await testPrisma.quotaIssuance.create({
    data: {
      userId,
      poolDate: data.poolDate,
      issuanceWeekStart: data.issuanceWeekStart,
      expiresAt: data.expiresAt,
      quotaAmount: data.quotaAmount,
      sourceUserScore: 50,
      sourceTotalScore: 100,
    },
  });

  // Create matching ledger entry (issue)
  await testPrisma.quotaLedgerEntry.create({
    data: {
      userId,
      entryType: "issue",
      amount: data.quotaAmount,
      balanceAfter: data.quotaAmount,
      referenceType: "quota_issuance",
      referenceId: data.poolDate.toISOString().split("T")[0],
    },
  });

  return issuance;
}

describe("Quota Expiry", () => {
  it("expires quota past expiresAt", async () => {
    const user = await createUser();
    const pastExpiry = new Date("2026-04-01T00:00:00Z"); // already expired

    await createIssuanceWithLedger(user.id, {
      poolDate: new Date("2026-03-25"),
      issuanceWeekStart: new Date("2026-03-23"),
      expiresAt: pastExpiry,
      quotaAmount: 500,
    });

    const result = await runQuotaExpiry();

    expect(result.expiredCount).toBe(1);
    expect(result.totalExpired).toBe(500);

    // Check ledger has expire entry
    const entries = await testPrisma.quotaLedgerEntry.findMany({
      where: { userId: user.id, entryType: "expire" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(-500);
    expect(entries[0].balanceAfter).toBe(0);
  });

  it("does NOT expire quota that has not reached expiresAt", async () => {
    const user = await createUser();
    const futureExpiry = new Date("2099-12-31T00:00:00Z");

    await createIssuanceWithLedger(user.id, {
      poolDate: new Date("2026-04-09"),
      issuanceWeekStart: new Date("2026-04-06"),
      expiresAt: futureExpiry,
      quotaAmount: 500,
    });

    const result = await runQuotaExpiry();

    expect(result.expiredCount).toBe(0);
    expect(result.totalExpired).toBe(0);
  });

  it("does NOT create duplicate expiry entries", async () => {
    const user = await createUser();
    const pastExpiry = new Date("2026-04-01T00:00:00Z");

    const issuance = await createIssuanceWithLedger(user.id, {
      poolDate: new Date("2026-03-25"),
      issuanceWeekStart: new Date("2026-03-23"),
      expiresAt: pastExpiry,
      quotaAmount: 500,
    });

    // First run
    await runQuotaExpiry();
    // Second run
    const result2 = await runQuotaExpiry();

    expect(result2.expiredCount).toBe(0);

    // Should still only have 1 expire entry
    const entries = await testPrisma.quotaLedgerEntry.findMany({
      where: { userId: user.id, entryType: "expire" },
    });
    expect(entries).toHaveLength(1);
  });

  it("expires only up to current balance", async () => {
    const user = await createUser();
    const pastExpiry = new Date("2026-04-01T00:00:00Z");

    await createIssuanceWithLedger(user.id, {
      poolDate: new Date("2026-03-25"),
      issuanceWeekStart: new Date("2026-03-23"),
      expiresAt: pastExpiry,
      quotaAmount: 500,
    });

    // Wait a tick to ensure createdAt ordering
    await new Promise((r) => setTimeout(r, 10));

    // Simulate partial consumption: reduce balance to 200
    await testPrisma.quotaLedgerEntry.create({
      data: {
        userId: user.id,
        entryType: "consume",
        amount: -300,
        balanceAfter: 200,
        referenceType: "consume",
      },
    });

    const result = await runQuotaExpiry();

    expect(result.totalExpired).toBe(200); // Only expire what's left

    const expireEntry = await testPrisma.quotaLedgerEntry.findFirst({
      where: { userId: user.id, entryType: "expire" },
    });
    expect(expireEntry!.amount).toBe(-200);
    expect(expireEntry!.balanceAfter).toBe(0);
  });

  it("skips expiry when balance is 0", async () => {
    const user = await createUser();
    const pastExpiry = new Date("2026-04-01T00:00:00Z");

    await createIssuanceWithLedger(user.id, {
      poolDate: new Date("2026-03-25"),
      issuanceWeekStart: new Date("2026-03-23"),
      expiresAt: pastExpiry,
      quotaAmount: 500,
    });

    // Wait a tick then consume all
    await new Promise((r) => setTimeout(r, 10));
    await testPrisma.quotaLedgerEntry.create({
      data: {
        userId: user.id,
        entryType: "consume",
        amount: -500,
        balanceAfter: 0,
      },
    });

    const result = await runQuotaExpiry();

    expect(result.expiredCount).toBe(0);
  });

  it("handles multiple expired issuances for same user", async () => {
    const user = await createUser();
    const pastExpiry = new Date("2026-04-01T00:00:00Z");

    // First issuance
    await createIssuanceWithLedger(user.id, {
      poolDate: new Date("2026-03-24"),
      issuanceWeekStart: new Date("2026-03-23"),
      expiresAt: pastExpiry,
      quotaAmount: 300,
    });

    // Wait to ensure ordering
    await new Promise((r) => setTimeout(r, 10));

    // Second issuance — use helper which creates ledger with correct balance
    await testPrisma.quotaIssuance.create({
      data: {
        userId: user.id,
        poolDate: new Date("2026-03-25"),
        issuanceWeekStart: new Date("2026-03-23"),
        expiresAt: pastExpiry,
        quotaAmount: 200,
        sourceUserScore: 50,
        sourceTotalScore: 100,
      },
    });
    await testPrisma.quotaLedgerEntry.create({
      data: {
        userId: user.id,
        entryType: "issue",
        amount: 200,
        balanceAfter: 500,
        referenceType: "quota_issuance",
        referenceId: "2026-03-25",
      },
    });

    const result = await runQuotaExpiry();

    // Both issuances should be processed, total expired = full balance
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);
    expect(result.totalExpired).toBeGreaterThan(0);

    // Final balance should be 0
    const lastEntry = await testPrisma.quotaLedgerEntry.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(lastEntry!.balanceAfter).toBe(0);
  });

  it("completes successfully with no expired issuances", async () => {
    const result = await runQuotaExpiry();

    expect(result.expiredCount).toBe(0);
    expect(result.totalExpired).toBe(0);
  });
});
