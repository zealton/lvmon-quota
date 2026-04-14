"use client";

import { Header } from "@/components/header";
import { AdminTabs } from "@/components/admin-tabs";
import { useEffect, useState } from "react";

interface AdminTweet {
  id: string;
  tweetId: string;
  text: string;
  status: string;
  authorUsername: string;
  createdAtX: string;
  score: { quality: number; engagement: number; trust: number; final: number; riskLevel: string } | null;
}

export default function AdminTweetsPage() {
  const [tweets, setTweets] = useState<AdminTweet[]>([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTweets = () => {
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (filter) params.set("status", filter);
    fetch(`/api/admin/tweets?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setTweets(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
      });
  };

  useEffect(() => { fetchTweets(); }, [page, filter]);

  const rejectTweet = async (id: string) => {
    const reason = prompt("Rejection reason:");
    if (reason === null) return;
    await fetch(`/api/admin/tweets/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    fetchTweets();
  };

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AdminTabs />
        <h1 className="text-2xl font-bold mb-6">Tweet Moderation</h1>

        <div className="flex gap-2 mb-4">
          {["", "captured", "eligible", "quality_scored", "scored", "rejected", "settled"].map((s) => (
            <button
              key={s}
              onClick={() => { setFilter(s); setPage(1); }}
              className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${
                filter === s
                  ? "bg-accent-long text-white"
                  : "bg-surface-3 text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {s === "quality_scored" ? "quality scored" : s || "All"}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto bg-surface-1 border border-border rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-subtle border-b border-border">
                <th className="text-left py-3 px-4">Author</th>
                <th className="text-left py-3 px-4">Text</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Score</th>
                <th className="text-right py-3 px-4">Risk</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tweets.map((t) => (
                <tr key={t.id} className="border-b border-border hover:bg-surface-hover/50 transition-colors">
                  <td className="py-3 px-4 font-medium">@{t.authorUsername}</td>
                  <td className="py-3 px-4 max-w-md truncate text-text-secondary">{t.text}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                      t.status === "scored" || t.status === "settled" ? "bg-accent-long/10 text-accent-long" :
                      t.status === "rejected" ? "bg-accent-short/10 text-accent-short" :
                      t.status === "quality_scored" ? "bg-accent-long/10 text-brand" :
                      "bg-warning/10 text-warning"
                    }`}>
                      {t.status === "quality_scored" ? "quality scored" : t.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{t.score?.final?.toFixed(1) || "-"}</td>
                  <td className="py-3 px-4 text-right">
                    {t.score?.riskLevel && t.score.riskLevel !== "none" && (
                      <span className="text-xs text-warning font-medium">{t.score.riskLevel}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {t.status !== "rejected" && (
                      <button
                        onClick={() => rejectTweet(t.id)}
                        className="text-xs text-accent-short hover:text-accent-short/80 font-medium transition-colors"
                      >
                        Reject
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-4 py-1.5 text-sm bg-surface-3 hover:bg-surface-hover rounded disabled:opacity-50 transition-colors">Prev</button>
            <span className="text-sm text-text-subtle">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-4 py-1.5 text-sm bg-surface-3 hover:bg-surface-hover rounded disabled:opacity-50 transition-colors">Next</button>
          </div>
        )}
      </main>
    </>
  );
}
