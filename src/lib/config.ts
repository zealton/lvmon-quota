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
};

const STRING_KEYS = new Set(["search_handle"]);

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
