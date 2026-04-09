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
    <div className="bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/20 rounded-xl p-6 mb-6">
      <div className="flex items-center gap-4">
        {summary.avatarUrl && (
          <img
            src={summary.avatarUrl}
            alt=""
            className="w-14 h-14 rounded-full border-2 border-purple-400/50"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{summary.displayName}</span>
            <span className="text-sm text-gray-400">@{summary.username}</span>
          </div>
          {stat && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs px-2 py-0.5 bg-purple-600/30 text-purple-300 rounded-full">
                Rank #{stat.rank}
              </span>
              <span className="text-xs px-2 py-0.5 bg-cyan-600/30 text-cyan-300 rounded-full">
                {stat.mindsharePercent}% mindshare
              </span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Balance</div>
          <div className="text-2xl font-bold text-cyan-400">
            {summary.currentBalance.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">LVMON Quota</div>
        </div>
      </div>

      {stat && (
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-700/50">
          <div>
            <div className="text-xs text-gray-400">Daily Reward</div>
            <div className="text-lg font-semibold text-green-400">
              +{stat.dailyReward.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Total Earned</div>
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
          className="flex-1 text-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Post on X
        </a>
        <a
          href={`/creators/${summary.username}`}
          className="flex-1 text-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          My Details
        </a>
      </div>
    </div>
  );
}
