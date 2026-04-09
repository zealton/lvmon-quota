import { startOfWeek, addWeeks } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "Asia/Shanghai";

export function getIssuanceWeekStart(date: Date): Date {
  const zoned = toZonedTime(date, TZ);
  return startOfWeek(zoned, { weekStartsOn: 1 }); // Monday
}

export function getExpiresAt(issuanceWeekStart: Date): Date {
  // Expires at the start of week N+2
  return addWeeks(issuanceWeekStart, 2);
}

/**
 * Largest Remainder Method for distributing integer quota
 * Ensures the sum of distributed amounts equals the total pool
 */
export function largestRemainderDistribution(
  shares: { userId: string; rawAmount: number }[],
  totalPool: number
): { userId: string; amount: number }[] {
  if (shares.length === 0) return [];

  const totalRaw = shares.reduce((sum, s) => sum + s.rawAmount, 0);
  if (totalRaw === 0) return shares.map((s) => ({ userId: s.userId, amount: 0 }));

  // Calculate floor amounts and remainders
  const items = shares.map((s) => {
    const exact = (s.rawAmount / totalRaw) * totalPool;
    const floor = Math.floor(exact);
    return {
      userId: s.userId,
      floor,
      remainder: exact - floor,
      exact,
    };
  });

  const floorSum = items.reduce((sum, i) => sum + i.floor, 0);
  let remaining = Math.round(totalPool) - floorSum;

  // Sort by remainder descending, distribute remaining units
  const sorted = [...items].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    sorted[i].floor += 1;
    remaining--;
  }

  return items.map((i) => ({
    userId: i.userId,
    amount: i.floor,
  }));
}
