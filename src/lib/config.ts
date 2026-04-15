import { prisma } from "./prisma";

export interface AppConfigValues {
  daily_quota_pool: number;
  epoch_duration_hours: number;
  tweet_observation_window_hours: number;
  max_tweets_per_user_per_day: number;
  tweet_weight_1: number;
  tweet_weight_2: number;
  tweet_weight_3: number;
  min_text_length: number;
  similarity_threshold: number;
  engagement_like_weight: number;
  engagement_reply_weight: number;
  engagement_retweet_weight: number;
  engagement_quote_weight: number;
  engagement_log_multiplier: number;
  max_search_results: number;
  // String configs
  search_handle: string;
  search_extra_keywords: string;
  scoring_prompt: string;
}

const DEFAULTS: AppConfigValues = {
  daily_quota_pool: 1000,
  epoch_duration_hours: 24,
  tweet_observation_window_hours: 0.5,
  max_tweets_per_user_per_day: 1,
  tweet_weight_1: 1.0,
  tweet_weight_2: 0,
  tweet_weight_3: 0,
  min_text_length: 10,
  similarity_threshold: 0.85,
  engagement_like_weight: 1,
  engagement_reply_weight: 2,
  engagement_retweet_weight: 3,
  engagement_quote_weight: 4,
  engagement_log_multiplier: 12,
  max_search_results: 20,
  search_handle: "@LeverUp_xyz",
  search_extra_keywords: "$LVMON, $LVUSD, LeverUp",
  scoring_prompt: `You are a tweet quality scorer for the LeverUp / LVMON crypto project mindshare campaign.

Score the tweet on 3 dimensions. Use decimal precision (e.g. 8.5, 12.3) — do NOT round to integers. Return JSON with these exact keys:
- relevance (0.0-15.0): How relevant is the content to LeverUp, LVMON, or the MON ecosystem? 15 = deeply relevant with specific project knowledge, 0 = completely unrelated
- originality (0.0-15.0): Is this original content with unique perspective? 15 = highly original analysis/insight, 0 = copy-paste template or generic shill
- format (0.0-10.0): Does it use rich formats and does the author have reach?
  Format scoring guide:
  +2 for images/video attachments
  +2 for thread/detailed analysis
  +1 for data/charts
  +1 for product links
  Author reach bonus (based on followers & verification):
  +1 if followers >= 1,000
  +2 if followers >= 10,000
  +3 if followers >= 50,000 OR verified account
  +4 if followers >= 100,000 AND verified
  (cap format score at 10)

Return: {"relevance": number, "originality": number, "format": number}`,
};

const STRING_KEYS = new Set(["search_handle", "search_extra_keywords", "scoring_prompt"]);

let configCache: AppConfigValues | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export async function getConfig(): Promise<AppConfigValues> {
  if (configCache && Date.now() - cacheTime < CACHE_TTL) {
    return configCache;
  }

  const rows = await prisma.appConfig.findMany();
  const config = { ...DEFAULTS };

  for (const row of rows) {
    if (row.key in config) {
      if (STRING_KEYS.has(row.key)) {
        (config as Record<string, string | number>)[row.key] = row.value;
      } else {
        (config as Record<string, string | number>)[row.key] = parseFloat(row.value);
      }
    }
  }

  configCache = config;
  cacheTime = Date.now();
  return config;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  configCache = null;
}

export function invalidateConfigCache() {
  configCache = null;
}
