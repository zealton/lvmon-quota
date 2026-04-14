import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { runDailySettlement } from "./daily-settlement";
import { TweetStatus } from "@prisma/client";
import fs from "fs";
import path from "path";

/**
 * Auto-settlement + CSV export for the previous epoch.
 * Called by the scheduler at each epoch boundary.
 */
export async function runEpochSettleAndExport() {
  const config = await getConfig();
  const epochMs = config.epoch_duration_hours * 60 * 60 * 1000;
  const cstOffset = 8 * 60 * 60 * 1000;
  const nowMs = Date.now() + cstOffset;
  const currentEpochStartCST = Math.floor(nowMs / epochMs) * epochMs;
  const prevEpochStartCST = currentEpochStartCST - epochMs;
  const settleDate = new Date(prevEpochStartCST - cstOffset);

  // Check if already settled
  const existingPool = await prisma.dailyQuotaPool.findUnique({
    where: { poolDate: settleDate },
  });
  if (existingPool?.status === "settled") {
    console.log(`[Epoch] Already settled: ${settleDate.toISOString()}`);
    return { status: "already_settled", date: settleDate.toISOString() };
  }

  // Run settlement
  console.log(`[Epoch] Settling epoch: ${settleDate.toISOString()}`);
  const result = await runDailySettlement(settleDate);

  // Generate CSV export
  const dateStr = settleDate.toISOString().split("T")[0];
  const epochNumber = await prisma.dailyQuotaPool.count({
    where: { status: { not: "open" } },
  });

  // Get settlement data for CSV
  const issuances = await prisma.quotaIssuance.findMany({
    where: { poolDate: settleDate },
    include: {
      user: {
        include: {
          socialAccounts: { where: { provider: "x" }, take: 1 },
        },
      },
    },
    orderBy: { quotaAmount: "desc" },
  });

  // Also get tweet-level author data for unbound users
  const settledTweets = await prisma.tweet.findMany({
    where: { status: TweetStatus.settled },
    include: { score: true },
  });
  const authorMap = new Map<string, { username: string; followers: number; verified: boolean }>();
  for (const t of settledTweets) {
    if (!authorMap.has(t.authorXUserId)) {
      authorMap.set(t.authorXUserId, {
        username: t.authorUsername || "unknown",
        followers: t.authorFollowers || 0,
        verified: t.authorVerified || false,
      });
    }
  }

  // Build CSV
  const pool = await prisma.dailyQuotaPool.findUnique({ where: { poolDate: settleDate } });
  const totalScore = pool?.totalScore || 0;

  const header = "epoch,date,rank,twitter_username,wallet,followers,verified,quality_score,engagement_score,trust_multiplier,final_score,mindshare_pct,quota";
  const rows: string[] = [];

  if (issuances.length > 0) {
    // Bound users from issuances
    for (let i = 0; i < issuances.length; i++) {
      const iss = issuances[i];
      const social = iss.user.socialAccounts[0];
      const userScore = await prisma.userDailyScore.findFirst({
        where: { userId: iss.userId, scoreDate: settleDate },
      });

      // Get best tweet score details
      const tweetIds = (userScore?.tweetIds as string[]) || [];
      let quality = 0, engagement = 0, trust = 1;
      if (tweetIds.length > 0) {
        const bestScore = await prisma.tweetScore.findFirst({
          where: { tweetId: tweetIds[0] },
        });
        if (bestScore) {
          quality = bestScore.qualityScore;
          engagement = bestScore.engagementScore;
          trust = bestScore.trustMultiplier;
        }
      }

      const mindshare = totalScore > 0 ? Math.round((iss.sourceUserScore / totalScore) * 10000) / 100 : 0;

      rows.push([
        epochNumber,
        dateStr,
        i + 1,
        social?.username || "unknown",
        iss.user.walletAddress || "",
        social?.followersCount || 0,
        social?.verified || false,
        quality.toFixed(1),
        engagement.toFixed(1),
        trust,
        iss.sourceUserScore.toFixed(1),
        mindshare,
        iss.quotaAmount,
      ].join(","));
    }
  }

  const csv = [header, ...rows].join("\n");

  // Save to public/exports/
  const exportDir = path.join(process.cwd(), "public", "exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const filename = `epoch-${epochNumber}-${dateStr}.csv`;
  const filepath = path.join(exportDir, filename);
  fs.writeFileSync(filepath, csv);
  console.log(`[Epoch] CSV exported: ${filename} (${rows.length} rows)`);

  // Also save as "latest.csv" for easy access
  fs.writeFileSync(path.join(exportDir, "latest.csv"), csv);

  return {
    status: "settled",
    epoch: epochNumber,
    date: dateStr,
    csvFile: `/exports/${filename}`,
    participants: rows.length,
    ...(typeof result === "object" && "totalScore" in result ? { totalScore: result.totalScore } : {}),
  };
}
