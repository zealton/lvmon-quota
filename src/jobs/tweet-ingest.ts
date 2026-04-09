import { prisma } from "@/lib/prisma";
import { getBearerClient, TWEET_FIELDS, USER_FIELDS, EXPANSIONS } from "@/lib/twitter";
import { getConfig } from "@/lib/config";

export async function runTweetIngest() {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: "tweet-ingest", status: "running" },
  });

  try {
    const client = getBearerClient();
    const config = await getConfig();

    // Build search query from configurable handle
    const handle = config.search_handle.replace(/^@/, "");
    const searchQuery = `@${handle} -is:retweet -is:reply`;
    const maxResults = Math.min(Math.max(config.max_search_results, 10), 100);

    const result = await client.v2.search(searchQuery, {
      "tweet.fields": TWEET_FIELDS.join(","),
      "user.fields": USER_FIELDS.join(","),
      expansions: EXPANSIONS.join(","),
      max_results: maxResults,
    });

    // Build author map from includes
    const authorMap = new Map<string, { username: string; name: string; avatarUrl?: string }>();
    if (result.includes?.users) {
      for (const user of result.includes.users) {
        authorMap.set(user.id, {
          username: user.username,
          name: user.name,
          avatarUrl: user.profile_image_url,
        });
      }
    }

    // Get all bound X user IDs
    const boundAccounts = await prisma.socialAccount.findMany({
      where: { provider: "x" },
      select: { providerUserId: true, userId: true },
    });
    const boundMap = new Map(boundAccounts.map((a) => [a.providerUserId, a.userId]));

    let captured = 0;
    let skipped = 0;

    const tweets = result.data?.data || [];
    for (const tweet of tweets) {
      // Skip if already captured
      const existing = await prisma.tweet.findUnique({
        where: { tweetId: tweet.id },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const authorId = tweet.author_id || "";
      const authorInfo = authorMap.get(authorId);
      const userId = boundMap.get(authorId) || null;

      // Determine tweet type from referenced_tweets
      const refs = tweet.referenced_tweets || [];
      const isRetweet = refs.some((r: { type: string }) => r.type === "retweeted");
      const isQuote = refs.some((r: { type: string }) => r.type === "quoted");
      const isReply = refs.some((r: { type: string }) => r.type === "replied_to");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasMedia = !!((tweet.attachments as any)?.media_keys?.length);

      const metrics = tweet.public_metrics || {
        like_count: 0,
        reply_count: 0,
        retweet_count: 0,
        quote_count: 0,
      };

      // Determine initial status — all tweets passing hard filters go to eligible
      let status: "captured" | "eligible" | "rejected" = "eligible";

      // Apply hard filters
      const handleLower = `@${handle}`.toLowerCase();
      if (isRetweet || isReply) {
        status = "rejected";
      } else if (!tweet.text || tweet.text.length < config.min_text_length) {
        status = "rejected";
      } else if (!tweet.text.toLowerCase().includes(handleLower)) {
        status = "rejected";
      }

      await prisma.tweet.create({
        data: {
          tweetId: tweet.id,
          userId,
          authorXUserId: authorId,
          authorUsername: authorInfo?.username || null,
          authorName: authorInfo?.name || null,
          authorAvatarUrl: authorInfo?.avatarUrl || null,
          text: tweet.text || "",
          lang: tweet.lang || null,
          conversationId: tweet.conversation_id || null,
          createdAtX: new Date(tweet.created_at || Date.now()),
          status,
          hasMedia,
          isQuote,
          isReply,
          isRetweet,
          querySource: "recent_search",
          metricSnapshots: {
            create: {
              snapshotType: "capture",
              likeCount: metrics.like_count || 0,
              replyCount: metrics.reply_count || 0,
              retweetCount: metrics.retweet_count || 0,
              quoteCount: metrics.quote_count || 0,
            },
          },
        },
      });

      captured++;
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "completed",
        endedAt: new Date(),
        result: { searchQuery, maxResults, captured, skipped, total: tweets.length },
      },
    });

    return { searchQuery, maxResults, captured, skipped, total: tweets.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "failed", endedAt: new Date(), error: message },
    });
    throw error;
  }
}
