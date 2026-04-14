"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface ViewerSummary {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  currentBalance: number;
  latestStat: {
    rank: number;
    mindsharePercent: number;
    dailyReward: number;
    totalReward: number;
  } | null;
}

export function UserSummaryCard() {
  const { data: session } = useSession();
  const [summary, setSummary] = useState<ViewerSummary | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch("/api/viewer/summary")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setSummary(data);
      })
      .catch(console.error);
  }, [session]);

  if (!session || !summary) return null;

  const stat = summary.latestStat;

  return (
    <div className="bg-surface-1 border border-border rounded-md p-6 mb-6">
      <div className="flex items-center gap-4">
        {summary.avatarUrl && (
          <img
            src={summary.avatarUrl}
            alt=""
            className="w-14 h-14 rounded ring-2 ring-brand/30"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{summary.displayName}</span>
            <span className="text-sm text-text-subtle">@{summary.username}</span>
          </div>
          {stat && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs px-2 py-0.5 bg-accent-long/10 text-brand rounded-lg font-medium">
                Rank #{stat.rank}
              </span>
              <span className="text-xs px-2 py-0.5 bg-info/10 text-info rounded-lg font-medium">
                {stat.mindsharePercent}% mindshare
              </span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-xs text-text-subtle uppercase tracking-wider">Balance</div>
          <div className="text-2xl font-bold text-brand">
            {summary.currentBalance.toLocaleString()}
          </div>
          <div className="text-xs text-text-subtle">LVMON Quota</div>
        </div>
      </div>

      {stat && (
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
          <div>
            <div className="text-xs text-text-subtle">Epoch Quota</div>
            <div className="text-lg font-semibold text-accent-long">
              +{stat.dailyReward.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-subtle">Total Quota</div>
            <div className="text-lg font-semibold">
              {stat.totalReward.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent("@LeverUp_xyz ")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center px-5 py-2.5 bg-accent-long hover:bg-accent-long-strong text-white text-sm font-semibold rounded transition-colors"
        >
          Post on X
        </a>
        <a
          href={`/creators/${summary.username}`}
          className="flex-1 text-center px-5 py-2.5 bg-surface-3 hover:bg-surface-hover text-text-primary text-sm font-semibold rounded transition-colors"
        >
          My Details
        </a>
      </div>
    </div>
  );
}
