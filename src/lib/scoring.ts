import OpenAI from "openai";
import { getConfig } from "./config";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface QualityScoreResult {
  relevanceSubscore: number;
  originalitySubscore: number;
  formatSubscore: number;
  totalQuality: number;
}

export async function scoreQuality(text: string, hasMedia: boolean): Promise<QualityScoreResult> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a tweet quality scorer for the LeverUp / LVMON crypto project mindshare campaign.

Score the tweet on 3 dimensions. Return JSON with these exact keys:
- relevance (0-15): How relevant is the content to LeverUp, LVMON, or the MON ecosystem? 15 = deeply relevant with specific project knowledge, 0 = completely unrelated
- originality (0-15): Is this original content with unique perspective? 15 = highly original analysis/insight, 0 = copy-paste template or generic shill
- format (0-10): Does it use rich formats? +3 for images/video, +3 for thread/detailed analysis, +2 for data/charts, +2 for product links

Return: {"relevance": number, "originality": number, "format": number}`,
        },
        {
          role: "user",
          content: `Tweet text: "${text}"\nHas media attachments: ${hasMedia}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { relevanceSubscore: 0, originalitySubscore: 0, formatSubscore: 0, totalQuality: 0 };

    const parsed = JSON.parse(content);
    const relevance = Math.min(15, Math.max(0, parsed.relevance || 0));
    const originality = Math.min(15, Math.max(0, parsed.originality || 0));
    const format = Math.min(10, Math.max(0, parsed.format || 0));

    return {
      relevanceSubscore: relevance,
      originalitySubscore: originality,
      formatSubscore: format,
      totalQuality: relevance + originality + format,
    };
  } catch (error) {
    console.error("Quality scoring error:", error);
    return { relevanceSubscore: 5, originalitySubscore: 5, formatSubscore: 0, totalQuality: 10 };
  }
}

export async function scoreEngagement(metrics: {
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  quoteCount: number;
}): Promise<number> {
  const config = await getConfig();

  const weighted =
    metrics.likeCount * config.engagement_like_weight +
    metrics.replyCount * config.engagement_reply_weight +
    metrics.retweetCount * config.engagement_retweet_weight +
    metrics.quoteCount * config.engagement_quote_weight;

  return Math.min(60, config.engagement_log_multiplier * Math.log(1 + weighted));
}

export interface TrustSignals {
  accountAgeDays: number;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  isBanned: boolean;
}

export function calculateTrustMultiplier(signals: TrustSignals): {
  multiplier: number;
  riskLevel: "none" | "low" | "medium" | "high";
  reasons: string[];
} {
  if (signals.isBanned) {
    return { multiplier: 0, riskLevel: "high", reasons: ["user_banned"] };
  }

  const reasons: string[] = [];
  let riskScore = 0;

  // Account too new
  if (signals.accountAgeDays < 14) {
    riskScore += 3;
    reasons.push("account_very_new");
  } else if (signals.accountAgeDays < 30) {
    riskScore += 1;
    reasons.push("account_new");
  }

  // Suspicious follower ratio
  if (signals.followersCount < 10 && signals.tweetCount > 500) {
    riskScore += 2;
    reasons.push("low_followers_high_tweets");
  }

  // Very few followers
  if (signals.followersCount < 5) {
    riskScore += 1;
    reasons.push("very_few_followers");
  }

  // Following much more than followers (potential follow-bot)
  if (signals.followingCount > 0 && signals.followersCount > 0) {
    const ratio = signals.followingCount / signals.followersCount;
    if (ratio > 10) {
      riskScore += 2;
      reasons.push("suspicious_follow_ratio");
    }
  }

  if (riskScore >= 4) return { multiplier: 0.5, riskLevel: "medium", reasons };
  if (riskScore >= 2) return { multiplier: 0.75, riskLevel: "low", reasons };
  if (riskScore >= 1) return { multiplier: 0.75, riskLevel: "low", reasons };

  return { multiplier: 1.0, riskLevel: "none", reasons: [] };
}

export function computeFinalScore(
  qualityScore: number,
  engagementScore: number,
  trustMultiplier: number
): number {
  return Math.min(100, trustMultiplier * (qualityScore + engagementScore));
}
