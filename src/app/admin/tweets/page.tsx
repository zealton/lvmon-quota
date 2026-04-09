"use client";

import { Header } from "@/components/header";
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
        <h1 className="text-2xl font-bold mb-6">Tweet Moderation</h1>

        <div className="flex gap-2 mb-4">
          {["", "captured", "eligible", "scored", "rejected", "settled"].map((s) => (
            <button
              key={s}
              onClick={() => { setFilter(s); setPage(1); }}
              className={`px-3 py-1 text-sm rounded ${
                filter === s ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left py-2">Author</th>
                <th className="text-left py-2">Text</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Score</th>
                <th className="text-right py-2">Risk</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tweets.map((t) => (
                <tr key={t.id} className="border-b border-gray-800/50">
                  <td className="py-2">@{t.authorUsername}</td>
                  <td className="py-2 max-w-md truncate text-gray-400">{t.text}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      t.status === "scored" || t.status === "settled" ? "bg-green-900/30 text-green-400" :
                      t.status === "rejected" ? "bg-red-900/30 text-red-400" :
                      "bg-yellow-900/30 text-yellow-400"
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">{t.score?.final?.toFixed(1) || "-"}</td>
                  <td className="py-2 text-right">
                    {t.score?.riskLevel && t.score.riskLevel !== "none" && (
                      <span className="text-xs text-orange-400">{t.score.riskLevel}</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {t.status !== "rejected" && (
                      <button
                        onClick={() => rejectTweet(t.id)}
                        className="text-xs text-red-400 hover:text-red-300"
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
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-50">Prev</button>
            <span className="text-sm text-gray-400">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-50">Next</button>
          </div>
        )}
      </main>
    </>
  );
}
