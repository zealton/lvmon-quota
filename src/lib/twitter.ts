import { TwitterApi } from "twitter-api-v2";

export function getBearerClient() {
  return new TwitterApi(process.env.X_BEARER_TOKEN!);
}

export function getUserClient(accessToken: string) {
  return new TwitterApi(accessToken);
}

export const TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "author_id",
  "conversation_id",
  "referenced_tweets",
  "lang",
  "attachments",
] as const;

export const USER_FIELDS = [
  "username",
  "verified",
  "created_at",
  "public_metrics",
  "profile_image_url",
  "name",
] as const;

export const EXPANSIONS = ["author_id"] as const;
