import { prisma } from "@/lib/prisma";
import { getBearerClient, TWEET_FIELDS, USER_FIELDS, EXPANSIONS } from "@/lib/twitter";
import { getConfig } from "@/lib/config";
import { scoreQuality, AuthorProfile } from "@/lib/scoring";

export async function runTweetIngest() {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: "tweet-ingest", status: "running" },
  });

  try {
    const client = getBearerClient();
    const config = await getConfig();

    // Build single OR query: primary handle + extra keywords
    const handle = config.search_handle.replace(/^@/, "");
    const extraKeywords = config.search_extra_keywords
      ? config.search_extra_keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
      : [];

    const orTerms = [`@${handle}`, ...extraKeywords];
    const searchQuery = `(${orTerms.join(" OR ")}) -is:retweet -is:reply`;
    const maxResults = Math.min(Math.max(config.max_search_results, 10), 100);

    // Get since_id from last successful ingest to avoid re-fetching old tweets
    const sinceIdRow = await prisma.appConfig.findUnique({ where: { key: "ingest_since_id" } });
    const sinceId = sinceIdRow?.value || undefined;

    // Fetch tweets with pagination
    const allTweets: any[] = [];
    const authorMap = new Map<string, {
      username: string;
      name: string;
      avatarUrl?: string;
      followersCount: number;
      verified: boolean;
    }>();

    let nextToken: string | undefined;
    let pagesRead = 0;
    const MAX_PAGES = 5;

    do {
      const searchParams: Record<string, any> = {
        "tweet.fields": TWEET_FIELDS.join(","),
        "user.fields": USER_FIELDS.join(","),
        expansions: EXPANSIONS.join(","),
        max_results: maxResults,
      };
      if (sinceId) searchParams.since_id = sinceId;
      if (nextToken) searchParams.next_token = nextToken;

      try {
        const result = await client.v2.search(searchQuery, searchParams);

        if (result.includes?.users) {
          for (const user of result.includes.users) {
            authorMap.set(user.id, {
              username: user.username,
              name: user.name,
              avatarUrl: user.profile_image_url,
              followersCount: (user.public_metrics as { followers_count?: number })?.followers_count || 0,
              verified: !!(user as { verified?: boolean }).verified,
            });
          }
        }

        const pageTweets = result.data?.data || [];
        allTweets.push(...pageTweets);

        nextToken = result.meta?.next_token;
        pagesRead++;
      } catch (err) {
        console.error(`Search error:`, err);
        break;
      }
    } while (nextToken && pagesRead < MAX_PAGES);

    // Get all bound X user IDs
    const boundAccounts = await prisma.socialAccount.findMany({
      where: { provider: "x" },
      select: { providerUserId: true, userId: true },
    });
    const boundMap = new Map(boundAccounts.map((a) => [a.providerUserId, a.userId]));

    let captured = 0;
    let skipped = 0;
    let newestTweetId: string | null = null;

    const tweets = allTweets;
    for (const tweet of tweets) {
      // Track the newest tweet ID for since_id on next run
      if (!newestTweetId) newestTweetId = tweet.id;

      // Skip if already captured (safety net, since_id should prevent most duplicates)
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
      const textLower = (tweet.text || "").toLowerCase();
      const mentionTerms = [`@${handle}`, ...extraKeywords].map((t: string) => t.toLowerCase());
      const hasMention = mentionTerms.some((term: string) => textLower.includes(term));

      if (isRetweet || isReply) {
        status = "rejected";
      } else if (!tweet.text || tweet.text.length < config.min_text_length) {
        status = "rejected";
      } else if (!hasMention) {
        status = "rejected";
      }

      const createdTweet = await prisma.tweet.create({
        data: {
          tweetId: tweet.id,
          ...(userId ? { user: { connect: { id: userId } } } : {}),
          authorXUserId: authorId,
          authorUsername: authorInfo?.username || null,
          authorName: authorInfo?.name || null,
          authorAvatarUrl: authorInfo?.avatarUrl || null,
          authorFollowers: authorInfo?.followersCount || 0,
          authorVerified: authorInfo?.verified || false,
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

      // Phase 1: Immediately score quality for eligible tweets
      if (status === "eligible") {
        try {
          const authorProfile: AuthorProfile | undefined = authorInfo
            ? {
                username: authorInfo.username,
                followersCount: authorInfo.followersCount,
                verified: authorInfo.verified,
              }
            : undefined;

          const quality = await scoreQuality(tweet.text || "", hasMedia, authorProfile);

          await prisma.tweetScore.create({
            data: {
              tweetId: createdTweet.id,
              qualityScore: quality.totalQuality,
              engagementScore: 0,
              trustMultiplier: 1,
              finalScore: quality.totalQuality, // Quality counts immediately toward mindshare
              riskLevel: "none",
              scoringVersion: "v1",
              isPublic: true,
              relevanceSubscore: quality.relevanceSubscore,
              originalitySubscore: quality.originalitySubscore,
              formatSubscore: quality.formatSubscore,
            },
          });

          await prisma.tweet.update({
            where: { id: createdTweet.id },
            data: { status: "quality_scored" },
          });
        } catch (err) {
          console.error(`Quality scoring failed for tweet ${tweet.id}:`, err);
          // Keep as eligible, tweet-score job will handle it later
        }
      }

      captured++;
    }

    // Save newest tweet ID for next run's since_id
    if (newestTweetId) {
      await prisma.appConfig.upsert({
        where: { key: "ingest_since_id" },
        update: { value: newestTweetId },
        create: { key: "ingest_since_id", value: newestTweetId },
      });
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "completed",
        endedAt: new Date(),
        result: { searchQuery, maxResults, captured, skipped, total: tweets.length, pages: pagesRead },
      },
    });

    return { searchQuery, maxResults, captured, skipped, total: tweets.length, pages: pagesRead };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "failed", endedAt: new Date(), error: message },
    });
    throw error;
  }
}
