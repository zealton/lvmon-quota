"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface LeaderboardItem {
  userId: string;
  rank: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followersCount: number;
  indexScore: number;
  mindsharePercent: number;
  dailyReward: number;
  dailyRewardDelta: number;
  totalReward: number;
}

interface LeaderboardData {
  date: string;
  pool: { quotaAmount: number; totalScore: number; status: string } | null;
  items: LeaderboardItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function LeaderboardTable() {
  const { data: session } = useSession();
  const currentUserId = (session as Record<string, any> | null)?.userId as string | undefined;
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/leaderboard?page=${page}&limit=50`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-14 bg-surface-elevated rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="text-center py-12 text-text-tertiary">
        <p className="text-lg">No leaderboard data yet</p>
        <p className="text-sm mt-1">Be the first to post about @LeverUp_xyz on X!</p>
      </div>
    );
  }

  return (
    <div>
      {data.pool && (
        <div className="flex items-center gap-4 mb-4 text-sm text-text-tertiary">
          <span>Date: {data.date}</span>
          <span>Pool: <span className="text-brand font-medium">{data.pool.quotaAmount.toLocaleString()} LVMON</span></span>
          <span>Status: {data.pool.status}</span>
          <span>Participants: {data.pagination.total}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-text-tertiary uppercase tracking-wider border-b border-border">
              <th className="text-left py-3 px-4">#</th>
              <th className="text-left py-3 px-4">Account</th>
              <th className="text-right py-3 px-4">Index</th>
              <th className="text-right py-3 px-4">Mindshare</th>
              <th className="text-right py-3 px-4">Daily Reward</th>
              <th className="text-right py-3 px-4">Total Reward</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => {
              const isCurrentUser = currentUserId === item.userId;
              return (
                <tr
                  key={item.userId}
                  className={`border-b border-border hover:bg-surface-elevated/50 transition-colors ${
                    isCurrentUser ? "bg-brand/5" : ""
                  }`}
                >
                  <td className="py-3 px-4">
                    <span
                      className={`font-mono text-sm ${
                        item.rank <= 3
                          ? "text-accent-yellow font-bold"
                          : "text-text-tertiary"
                      }`}
                    >
                      {item.rank}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/creators/${item.username}`}
                      className="flex items-center gap-3 hover:opacity-80"
                    >
                      {item.avatarUrl ? (
                        <img
                          src={item.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-secondary" />
                      )}
                      <div>
                        <div className="font-medium text-sm">
                          {item.displayName}
                          {isCurrentUser && (
                            <span className="ml-1 text-xs text-brand">(You)</span>
                          )}
                        </div>
                        <div className="text-xs text-text-tertiary">@{item.username}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm">
                    {item.indexScore.toFixed(1)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-accent-cyan">
                    {item.mindsharePercent}%
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-mono text-sm text-accent-green">
                      +{item.dailyReward.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm">
                    {item.totalReward.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] disabled:opacity-50 transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-text-tertiary">
            {page} / {data.pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
            disabled={page === data.pagination.totalPages}
            className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
