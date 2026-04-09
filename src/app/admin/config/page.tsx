"use client";

import { Header } from "@/components/header";
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
  max_search_results: { label: "Max Search Results", type: "number", group: "Search" },
  daily_quota_pool: { label: "Daily Quota Pool", type: "number", group: "Quota" },
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
    desc: "Twitter 搜索相关配置。系统会定期搜索包含指定 handle 的推文。",
  },
  Quota: {
    desc: "每日 LVMON quota 发放总量。按用户 mindshare 占比分配。",
    formula: "user_quota = daily_pool × (user_score / total_score)",
  },
  Scoring: {
    desc: "推文评分与用户每日得分计算规则。每条推文在观察窗口结束后评分一次，同一条不会重复参与多日分配。",
    formula: "user_daily_score = s1 × w1 + s2 × w2 + s3 × w3",
    rules: [
      "每个用户每天最多 N 条推文参与计分（取分数最高的 top N）",
      "tweet_score = trust_multiplier × (quality_score + engagement_score)，最终分数上限 100",
      "quality_score (0~40): LLM 评分 = relevance(0~15) + originality(0~15) + format(0~10)",
      "Weight #1/#2/#3 是递减权重，用来抑制同一用户的多推文刷分",
    ],
  },
  "Anti-spam": {
    desc: "反作弊与内容过滤规则，用来剔除低质量和重复内容。",
    rules: [
      "Min Text Length: 推文正文少于该字符数 → 直接拒绝",
      "Similarity Threshold: 同一用户的两条推文文本相似度超过阈值 → 只保留分数高的，另一条标记 rejected",
      "Hard filters (不可配置): retweet/reply 自动拒绝，未绑定用户不计分",
      "Trust Multiplier: 账号年龄<14天/粉丝异常/高频发帖 → 降权 (0.75/0.5/0)",
    ],
  },
  Engagement: {
    desc: "互动分数计算规则。使用对数压缩避免大号碾压小号。",
    formula: "engagement_score = min(60, multiplier × ln(1 + like×w1 + reply×w2 + retweet×w3 + quote×w4))",
    rules: [
      "Quote > Retweet > Reply > Like (权重从高到低)",
      "对数压缩使得前几十个互动价值最高，后续边际递减",
      "Log Multiplier 控制整体缩放系数，默认 12 → 约 55 个 weighted engagement 就能拿满 60 分",
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

  if (!config) return <div className="p-8 text-center">Loading...</div>;

  // Group fields
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
        <h1 className="text-2xl font-bold mb-6">Campaign Config</h1>

        <div className="space-y-6">
          {Array.from(groups.entries()).map(([groupName, keys]) => {
            const info = GROUP_DESCRIPTIONS[groupName];
            return (
              <div key={groupName} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider mb-2">
                  {groupName}
                </h2>

                {/* Description */}
                {info && (
                  <div className="mb-4 text-xs text-gray-500 space-y-1.5">
                    <p>{info.desc}</p>
                    {info.formula && (
                      <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 font-mono text-cyan-400/80">
                        {info.formula}
                      </div>
                    )}
                    {info.rules && (
                      <ul className="space-y-1 text-gray-500">
                        {info.rules.map((rule, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-gray-600 shrink-0">-</span>
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Fields */}
                <div className="space-y-3">
                  {keys.map((key) => {
                    const field = CONFIG_FIELDS[key];
                    return (
                      <div key={key} className="flex items-center gap-4">
                        <label className="w-64 text-sm text-gray-400">{field.label}</label>
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
                          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save Config"}
        </button>
      </main>
    </>
  );
}
