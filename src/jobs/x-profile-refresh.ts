import { prisma } from "@/lib/prisma";
import { getBearerClient } from "@/lib/twitter";

export async function runXProfileRefresh() {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: "x-profile-refresh", status: "running" },
  });

  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { provider: "x" },
      include: { user: { select: { status: true } } },
    });

    const client = getBearerClient();
    let updated = 0;
    let errors = 0;

    // Process in batches of 100 (Twitter API limit)
    for (let i = 0; i < accounts.length; i += 100) {
      const batch = accounts.slice(i, i + 100);
      const ids = batch.map((a) => a.providerUserId);

      try {
        const result = await client.v2.users(ids, {
          "user.fields": "public_metrics,created_at,verified",
        });

        for (const userData of result.data || []) {
          const account = batch.find((a) => a.providerUserId === userData.id);
          if (!account) continue;

          await prisma.socialAccount.update({
            where: { id: account.id },
            data: {
              followersCount: userData.public_metrics?.followers_count || 0,
              followingCount: userData.public_metrics?.following_count || 0,
              tweetCount: userData.public_metrics?.tweet_count || 0,
              verified: userData.verified || false,
              accountCreatedAt: userData.created_at
                ? new Date(userData.created_at)
                : undefined,
              username: userData.username || undefined,
              name: userData.name || undefined,
            },
          });
          updated++;
        }
      } catch (err) {
        console.error("Profile refresh batch error:", err);
        errors++;
      }
    }

    // Also backfill tweet author_followers / author_verified for tweets missing this data
    const tweetsToBackfill = await prisma.tweet.findMany({
      where: { authorFollowers: 0 },
      select: { id: true, authorXUserId: true },
    });

    // Deduplicate by author ID
    const uniqueAuthorIds = [...new Set(tweetsToBackfill.map((t) => t.authorXUserId))];
    const authorDataMap = new Map<string, { followers: number; verified: boolean }>();
    let tweetBackfilled = 0;

    for (let i = 0; i < uniqueAuthorIds.length; i += 100) {
      const batchIds = uniqueAuthorIds.slice(i, i + 100);
      try {
        const result = await client.v2.users(batchIds, {
          "user.fields": "public_metrics,verified",
        });
        for (const u of result.data || []) {
          authorDataMap.set(u.id, {
            followers: u.public_metrics?.followers_count || 0,
            verified: u.verified || false,
          });
        }
      } catch (err) {
        console.error("Tweet author backfill batch error:", err);
        errors++;
      }
    }

    // Update tweets
    for (const tweet of tweetsToBackfill) {
      const authorData = authorDataMap.get(tweet.authorXUserId);
      if (authorData && authorData.followers > 0) {
        await prisma.tweet.update({
          where: { id: tweet.id },
          data: {
            authorFollowers: authorData.followers,
            authorVerified: authorData.verified,
          },
        });
        tweetBackfilled++;
      }
    }

    const result = { updated, errors, total: accounts.length, tweetBackfilled };

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
