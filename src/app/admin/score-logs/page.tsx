"use client";

import { Header } from "@/components/header";
import { AdminTabs } from "@/components/admin-tabs";
import { useEffect, useState } from "react";

interface ScoreLogItem {
  id: string;
  tweetId: string;
  author: string | null;
  type: "new" | "update";
  quality: number;
  engagementPrev: number;
  engagementNew: number;
  finalPrev: number;
  finalNew: number;
  delta: number;
  trust: number;
  time: string;
}

export default function ScoreLogsPage() {
  const [logs, setLogs] = useState<ScoreLogItem[]>([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = () => {
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (filter) params.set("type", filter);
    fetch(`/api/admin/score-logs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
      });
  };

  useEffect(() => { fetchLogs(); }, [page, filter]);

  // Auto refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, page, filter]);

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AdminTabs />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Score Change Log</h1>
            <p className="text-sm text-text-tertiary mt-1">Track how tweet scores change over time as engagement grows</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-1.5 text-sm rounded-[56px] font-medium transition-colors ${
                autoRefresh ? "bg-accent-green/10 text-accent-green" : "bg-surface-secondary text-text-tertiary"
              }`}
            >
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </button>
            <button onClick={fetchLogs} className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] font-medium transition-colors">
              Refresh
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {["", "new", "update"].map((t) => (
            <button
              key={t}
              onClick={() => { setFilter(t); setPage(1); }}
              className={`px-4 py-1.5 text-sm rounded-[56px] font-medium transition-colors ${
                filter === t ? "bg-brand text-white" : "bg-surface-secondary text-text-secondary hover:bg-surface-elevated"
              }`}
            >
              {t === "" ? "All" : t === "new" ? "First Score" : "Updates"}
            </button>
          ))}
        </div>

        <div className="bg-surface-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-tertiary border-b border-border">
                <th className="text-left py-3 px-4">Time</th>
                <th className="text-left py-3 px-4">Author</th>
                <th className="text-left py-3 px-4">Type</th>
                <th className="text-right py-3 px-4">Content</th>
                <th className="text-right py-3 px-4">Engagement</th>
                <th className="text-right py-3 px-4">Score</th>
                <th className="text-right py-3 px-4">Change</th>
                <th className="text-right py-3 px-4">Trust</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border hover:bg-surface-elevated/50 transition-colors">
                  <td className="py-2.5 px-4 text-xs text-text-tertiary whitespace-nowrap">
                    {new Date(l.time).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4">
                    <a
                      href={`https://x.com/${l.author}/status/${l.tweetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-secondary hover:text-brand transition-colors"
                    >
                      @{l.author || "?"}
                    </a>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                      l.type === "new" ? "bg-brand/10 text-brand" : "bg-accent-cyan/10 text-accent-cyan"
                    }`}>
                      {l.type === "new" ? "First" : "Update"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-brand">
                    {l.quality.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {l.type === "update" ? (
                      <span className="text-text-secondary">
                        {l.engagementPrev.toFixed(1)} <span className="text-text-tertiary">→</span> <span className="text-accent-cyan">{l.engagementNew.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-accent-cyan">{l.engagementNew.toFixed(1)}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {l.type === "update" ? (
                      <span className="text-text-secondary">
                        {l.finalPrev.toFixed(1)} <span className="text-text-tertiary">→</span> <span className="text-accent-green">{l.finalNew.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-accent-green">{l.finalNew.toFixed(1)}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {l.delta !== 0 ? (
                      <span className={l.delta > 0 ? "text-accent-green" : "text-accent-red"}>
                        {l.delta > 0 ? "+" : ""}{l.delta.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-text-tertiary">
                    {l.trust < 1 ? (
                      <span className="text-accent-yellow">{l.trust}x</span>
                    ) : (
                      <span>{l.trust}x</span>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-tertiary">
                    No score logs yet. Logs will appear after the next engagement scoring run.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] disabled:opacity-50 transition-colors">Prev</button>
            <span className="text-sm text-text-tertiary">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] disabled:opacity-50 transition-colors">Next</button>
          </div>
        )}
      </main>
    </>
  );
}
