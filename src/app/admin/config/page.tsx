"use client";

import { Header } from "@/components/header";
import { AdminTabs } from "@/components/admin-tabs";
import { useEffect, useState } from "react";

interface ConfigValues {
  [key: string]: number | string;
}

interface ConfigField {
  label: string;
  type: "number" | "text";
  group: string;
}

const CONFIG_FIELDS: Record<string, ConfigField> = {
  search_handle: { label: "Search Handle (Twitter @)", type: "text", group: "Search" },
  search_extra_keywords: { label: "Extra Search Keywords (comma separated)", type: "text", group: "Search" },
  max_search_results: { label: "Max Results Per Query", type: "number", group: "Search" },
  daily_quota_pool: { label: "Daily Quota Pool", type: "number", group: "Quota" },
  epoch_duration_hours: { label: "Epoch Duration (hours)", type: "number", group: "Quota" },
  tweet_observation_window_hours: { label: "Observation Window (hours)", type: "number", group: "Scoring" },
  max_tweets_per_user_per_day: { label: "Max Tweets Per User Per Day", type: "number", group: "Scoring" },
  tweet_weight_1: { label: "Tweet #1 Weight", type: "number", group: "Scoring" },
  tweet_weight_2: { label: "Tweet #2 Weight", type: "number", group: "Scoring" },
  tweet_weight_3: { label: "Tweet #3 Weight", type: "number", group: "Scoring" },
  min_text_length: { label: "Min Text Length (chars)", type: "number", group: "Anti-spam" },
  similarity_threshold: { label: "Similarity Threshold", type: "number", group: "Anti-spam" },
  engagement_like_weight: { label: "Like Weight", type: "number", group: "Engagement" },
  engagement_reply_weight: { label: "Reply Weight", type: "number", group: "Engagement" },
  engagement_retweet_weight: { label: "Retweet Weight", type: "number", group: "Engagement" },
  engagement_quote_weight: { label: "Quote Weight", type: "number", group: "Engagement" },
  engagement_log_multiplier: { label: "Engagement Log Multiplier", type: "number", group: "Engagement" },
};

const GROUP_DESCRIPTIONS: Record<string, { desc: string; formula?: string; rules?: string[] }> = {
  Search: {
    desc: "Twitter search configuration. Each keyword runs as a separate search query. Tweets matching any keyword are captured.",
    rules: [
      "Search Handle: primary @ mention to search for",
      "Extra Keywords: comma-separated list (e.g. $LVMON, $LVUSD, LeverUp). Each runs as a separate search query.",
      "Max Results Per Query: results per page per query (10-100). Each query paginates up to 3 pages.",
    ],
  },
  Quota: {
    desc: "Quota pool and epoch timing. Each epoch distributes quota proportionally by user mindshare score.",
    formula: "user_quota = daily_pool x (user_score / total_score)",
    rules: [
      "Epoch Duration: How long each epoch lasts. Default 24h. Set shorter for testing (e.g. 1h).",
    ],
  },
  Scoring: {
    desc: "Tweet scoring and daily user score calculation rules.",
    formula: "user_daily_score = score_1st x W1 + score_2nd x W2 + score_3rd x W3",
    rules: [
      "Observation Window: Wait N hours after tweet post before scoring engagement",
      "Max Tweets Per User Per Day: Top N tweets per user per day count toward score",
      "tweet_score = trust_multiplier x (quality_score + engagement_score), max 100",
      "quality_score (0-40): GPT-4o-mini = relevance(0-15) + originality(0-15) + format(0-10)",
    ],
  },
  "Anti-spam": {
    desc: "Anti-abuse and content filtering rules.",
    rules: [
      "Min Text Length: Tweets shorter than this are auto-rejected",
      "Similarity Threshold: Duplicate tweets from same user above this threshold are rejected",
      "Hard filters: retweets/replies auto-rejected",
      "Trust Multiplier: New accounts / suspicious patterns get 0.75x or 0.5x",
    ],
  },
  Engagement: {
    desc: "Engagement score calculation. Uses log compression to prevent large accounts from dominating.",
    formula: "engagement_score = min(60, multiplier x ln(1 + like*w1 + reply*w2 + retweet*w3 + quote*w4))",
    rules: [
      "Quote > Retweet > Reply > Like (weight descending)",
      "Log compression: first interactions worth more, diminishing returns after",
      "Log Multiplier controls scale — default 12 means ~55 weighted engagements max out at 60",
    ],
  },
};

export default function AdminConfigPage() {
  const [config, setConfig] = useState<ConfigValues | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then(setConfig);
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    alert("Config saved");
  };

  if (!config) return <div className="p-8 text-center text-text-subtle">Loading...</div>;

  const groups = new Map<string, string[]>();
  for (const [key, field] of Object.entries(CONFIG_FIELDS)) {
    const list = groups.get(field.group) || [];
    list.push(key);
    groups.set(field.group, list);
  }

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <AdminTabs />
        <h1 className="text-2xl font-bold mb-6">Campaign Config</h1>

        <div className="space-y-6">
          {Array.from(groups.entries()).map(([groupName, keys]) => {
            const info = GROUP_DESCRIPTIONS[groupName];
            return (
              <div key={groupName} className="bg-surface-1 border border-border rounded-md p-6">
                <h2 className="text-sm font-semibold text-brand uppercase tracking-wider mb-2">
                  {groupName}
                </h2>

                {info && (
                  <div className="mb-4 text-xs text-text-subtle space-y-1.5">
                    <p>{info.desc}</p>
                    {info.formula && (
                      <div className="bg-surface-hover border border-border rounded px-3 py-2 font-mono text-info">
                        {info.formula}
                      </div>
                    )}
                    {info.rules && (
                      <ul className="space-y-1 text-text-subtle">
                        {info.rules.map((rule, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-text-subtle shrink-0">-</span>
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {keys.map((key) => {
                    const field = CONFIG_FIELDS[key];
                    return (
                      <div key={key} className="flex items-center gap-4">
                        <label className="w-64 text-sm text-text-secondary">{field.label}</label>
                        <input
                          type={field.type}
                          step={field.type === "number" ? "any" : undefined}
                          value={config[key] ?? (field.type === "number" ? 0 : "")}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              [key]:
                                field.type === "number"
                                  ? parseFloat(e.target.value) || 0
                                  : e.target.value,
                            })
                          }
                          className="flex-1 bg-surface-hover border border-border rounded px-3 py-2 text-sm focus:border-accent-long focus:outline-none transition-colors"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scoring Prompt */}
        <div className="bg-surface-1 border border-border rounded-md p-6 mt-6">
          <h2 className="text-sm font-semibold text-accent-long uppercase tracking-wider mb-2">
            LLM Scoring Prompt
          </h2>
          <p className="text-xs text-text-subtle mb-3">
            System prompt sent to GPT-4o-mini for content quality scoring. Changes take effect on the next tweet scan.
          </p>
          <textarea
            value={(config.scoring_prompt as string) || ""}
            onChange={(e) => setConfig({ ...config, scoring_prompt: e.target.value })}
            rows={18}
            className="w-full bg-surface-hover border border-border rounded px-3 py-2 text-sm font-mono leading-relaxed focus:border-accent-long focus:outline-none transition-colors resize-y"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full py-3 bg-accent-long hover:bg-accent-long-strong disabled:bg-surface-3 text-bg-canvas font-semibold rounded transition-colors"
        >
          {saving ? "Saving..." : "Save Config"}
        </button>
      </main>
    </>
  );
}
