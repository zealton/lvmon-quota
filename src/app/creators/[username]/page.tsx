"use client";

import { Header } from "@/components/header";
import { TweetCard } from "@/components/tweet-card";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface CreatorData {
  username: string;
  name: string;
  avatarUrl: string | null;
  followersCount: number;
  verified: boolean;
  currentBalance: number;
  dailyStats: {
    date: string;
    rank: number;
    indexScore: number;
    mindsharePercent: number;
    dailyReward: number;
    totalReward: number;
  }[];
  tweets: {
    tweetId: string;
    text: string;
    createdAt: string;
    hasMedia: boolean;
    status?: string;
    score: { quality: number; engagement: number | null; trust: number | null; final: number | null; engagementPending?: boolean } | null;
    metrics: { likes: number; replies: number; retweets: number; quotes: number } | null;
  }[];
}

export default function CreatorPage() {
  const params = useParams();
  const username = params.username as string;
  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/public/creators/${username}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-surface-elevated rounded-2xl" />
            <div className="h-64 bg-surface-elevated rounded-2xl" />
          </div>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8 text-center text-text-tertiary">
          Creator not found
        </main>
      </>
    );
  }

  const latestStat = data.dailyStats[0];

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile */}
        <div className="bg-surface-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            {data.avatarUrl ? (
              <img src={data.avatarUrl} alt="" className="w-16 h-16 rounded-full" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-surface-secondary" />
            )}
            <div>
              <h1 className="text-xl font-bold">{data.name}</h1>
              <div className="flex items-center gap-2 text-sm text-text-tertiary">
                <span>@{data.username}</span>
                {data.verified && (
                  <span className="text-brand font-medium">Verified</span>
                )}
                <span>{data.followersCount.toLocaleString()} followers</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-text-tertiary">Balance</div>
              <div className="text-2xl font-bold text-brand">
                {data.currentBalance.toLocaleString()}
              </div>
            </div>
          </div>

          {latestStat && (
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-text-tertiary">Rank</div>
                <div className="text-lg font-semibold">#{latestStat.rank}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Mindshare</div>
                <div className="text-lg font-semibold text-accent-cyan">
                  {latestStat.mindsharePercent}%
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Daily Reward</div>
                <div className="text-lg font-semibold text-accent-green">
                  +{latestStat.dailyReward.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Total Earned</div>
                <div className="text-lg font-semibold">
                  {latestStat.totalReward.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Daily History */}
        {data.dailyStats.length > 0 && (
          <div className="bg-surface-card border border-border rounded-2xl p-6 mb-6">
            <h2 className="font-semibold mb-4">Daily History</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-tertiary border-b border-border">
                    <th className="text-left py-2">Date</th>
                    <th className="text-right py-2">Rank</th>
                    <th className="text-right py-2">Score</th>
                    <th className="text-right py-2">Mindshare</th>
                    <th className="text-right py-2">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyStats.map((s) => (
                    <tr key={s.date} className="border-b border-border">
                      <td className="py-2">{new Date(s.date).toLocaleDateString()}</td>
                      <td className="text-right">#{s.rank}</td>
                      <td className="text-right">{s.indexScore.toFixed(1)}</td>
                      <td className="text-right text-accent-cyan">{s.mindsharePercent}%</td>
                      <td className="text-right text-accent-green">+{s.dailyReward}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tweets */}
        <h2 className="font-semibold mb-4">Scored Tweets</h2>
        <div className="space-y-4">
          {data.tweets.map((t) => (
            <TweetCard
              key={t.tweetId}
              tweetId={t.tweetId}
              text={t.text}
              createdAt={t.createdAt}
              hasMedia={t.hasMedia}
              author={{
                username: data.username,
                name: data.name,
                avatarUrl: data.avatarUrl,
              }}
              score={
                t.score
                  ? {
                      quality: t.score.quality,
                      engagement: t.score.engagement,
                      final: t.score.final,
                      engagementPending: t.score.engagementPending,
                    }
                  : null
              }
              metrics={t.metrics}
            />
          ))}
          {data.tweets.length === 0 && (
            <div className="text-center py-8 text-text-tertiary">No scored tweets yet</div>
          )}
        </div>
      </main>
    </>
  );
}
