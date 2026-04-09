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

    const result = { updated, errors, total: accounts.length };

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
