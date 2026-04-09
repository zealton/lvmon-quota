import { prisma } from "@/lib/prisma";
import { toZonedTime } from "date-fns-tz";

const TZ = "Asia/Shanghai";

export async function runQuotaExpiry() {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: "quota-expiry", status: "running" },
  });

  try {
    const now = toZonedTime(new Date(), TZ);

    // Find expired issuances
    const expiredIssuances = await prisma.quotaIssuance.findMany({
      where: {
        expiresAt: { lte: now },
        quotaAmount: { gt: 0 },
      },
    });

    // Check which ones haven't been expired in ledger yet
    let expiredCount = 0;
    let totalExpired = 0;

    for (const issuance of expiredIssuances) {
      // Check if already expired in ledger
      const existing = await prisma.quotaLedgerEntry.findFirst({
        where: {
          userId: issuance.userId,
          entryType: "expire",
          referenceType: "quota_issuance",
          referenceId: issuance.id,
        },
      });

      if (existing) continue;

      // Get current balance
      const lastEntry = await prisma.quotaLedgerEntry.findFirst({
        where: { userId: issuance.userId },
        orderBy: { createdAt: "desc" },
      });
      const currentBalance = lastEntry?.balanceAfter || 0;
      const expireAmount = Math.min(issuance.quotaAmount, currentBalance);

      if (expireAmount <= 0) continue;

      await prisma.quotaLedgerEntry.create({
        data: {
          userId: issuance.userId,
          entryType: "expire",
          amount: -expireAmount,
          balanceAfter: currentBalance - expireAmount,
          referenceType: "quota_issuance",
          referenceId: issuance.id,
        },
      });

      expiredCount++;
      totalExpired += expireAmount;
    }

    const result = { expiredCount, totalExpired };

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
