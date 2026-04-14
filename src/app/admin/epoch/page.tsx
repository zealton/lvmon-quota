"use client";

import { Header } from "@/components/header";
import { AdminTabs } from "@/components/admin-tabs";
import { useEffect, useState } from "react";

interface EpochParticipant {
  rank: number;
  twitter: { username: string | null; name: string | null; userId: string | null; followersCount: number; verified: boolean };
  wallet: string | null;
  score: Record<string, any>;
  mindsharePercent: number;
  quota: number;
}

interface EpochData {
  epoch: { number: number; date: string; status: string; poolSize: number; totalScore: number; participantCount: number };
  participants: EpochParticipant[];
}

export default function EpochPage() {
  const [mode, setMode] = useState<"current" | "latest" | "custom">("current");
  const [customDate, setCustomDate] = useState("");
  const [data, setData] = useState<EpochData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEpoch = (endpoint: string) => {
    setLoading(true);
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); else setData(null); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (mode === "current") fetchEpoch("/api/epoch/current");
    else if (mode === "latest") fetchEpoch("/api/epoch/latest");
    else if (mode === "custom" && customDate) fetchEpoch(`/api/epoch/${customDate}`);
  }, [mode, customDate]);

  const exportCSV = () => {
    if (!data) return;
    const header = "rank,twitter_username,twitter_name,followers,verified,wallet,quality,engagement,trust,best_score,mindshare_pct,quota";
    const rows = data.participants.map((p) =>
      [
        p.rank,
        p.twitter.username || "",
        `"${(p.twitter.name || "").replace(/"/g, '""')}"`,
        p.twitter.followersCount,
        p.twitter.verified,
        p.wallet || "",
        p.score.quality ?? p.score.score1 ?? "",
        p.score.engagement ?? "",
        p.score.trust ?? "",
        p.score.best,
        p.mindsharePercent,
        p.quota,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `epoch-${data.epoch.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJSON = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert("Copied to clipboard");
  };

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AdminTabs />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Epoch Settlement</h1>
            <p className="text-sm text-text-subtle mt-1">View and export epoch data for LeverUp backend integration</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyJSON} disabled={!data} className="px-5 py-2 bg-surface-3 hover:bg-surface-hover disabled:opacity-50 rounded text-sm font-medium transition-colors">
              Copy JSON
            </button>
            <button onClick={exportCSV} disabled={!data} className="px-5 py-2 bg-accent-long hover:bg-accent-long-strong disabled:opacity-50 text-white rounded text-sm font-medium transition-colors">
              Export CSV
            </button>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-3 mb-6">
          {(["current", "latest", "custom"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${
                mode === m ? "bg-accent-long text-white" : "bg-surface-3 text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {m === "current" ? "Current (Live)" : m === "latest" ? "Latest Settled" : "By Date"}
            </button>
          ))}
          {mode === "custom" && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="bg-surface-hover border border-border rounded px-3 py-1.5 text-sm focus:border-accent-long focus:outline-none"
            />
          )}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface-hover rounded" />
            ))}
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-text-subtle">
            <p className="text-lg">No epoch data found</p>
            <p className="text-sm mt-1">Run a daily settlement first, or switch to "Current (Live)" view.</p>
          </div>
        ) : (
          <>
            {/* Epoch summary */}
            <div className="grid grid-cols-5 gap-4 mb-6">
              <div className="bg-surface-1 border border-border rounded-md p-4">
                <div className="text-xs text-text-subtle">Epoch</div>
                <div className="text-lg font-bold">#{data.epoch.number ?? "-"}</div>
                <div className="text-xs text-text-subtle mt-1">{data.epoch.date}</div>
              </div>
              <div className="bg-surface-1 border border-border rounded-md p-4">
                <div className="text-xs text-text-subtle">Status</div>
                <div className={`text-lg font-bold ${
                  data.epoch.status === "settled" ? "text-accent-long" :
                  data.epoch.status === "live" ? "text-warning" : "text-text-subtle"
                }`}>{data.epoch.status}</div>
              </div>
              <div className="bg-surface-1 border border-border rounded-md p-4">
                <div className="text-xs text-text-subtle">Pool Size</div>
                <div className="text-lg font-bold text-brand">{data.epoch.poolSize.toLocaleString()}</div>
              </div>
              <div className="bg-surface-1 border border-border rounded-md p-4">
                <div className="text-xs text-text-subtle">Total Score</div>
                <div className="text-lg font-bold">{data.epoch.totalScore}</div>
              </div>
              <div className="bg-surface-1 border border-border rounded-md p-4">
                <div className="text-xs text-text-subtle">Participants</div>
                <div className="text-lg font-bold">{data.epoch.participantCount}</div>
              </div>
            </div>

            {/* API endpoint info */}
            <div className="bg-surface-1 border border-border rounded-md p-4 mb-6">
              <div className="text-xs text-text-subtle mb-1">API Endpoint</div>
              <code className="text-sm text-info font-mono break-all">
                GET /api/epoch/{data.epoch.date}
              </code>
            </div>

            {/* Participants table */}
            <div className="bg-surface-1 border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-subtle border-b border-border">
                    <th className="text-left py-3 px-4">#</th>
                    <th className="text-left py-3 px-4">Twitter</th>
                    <th className="text-left py-3 px-4">Wallet</th>
                    <th className="text-right py-3 px-4">Score</th>
                    <th className="text-right py-3 px-4">Mindshare</th>
                    <th className="text-right py-3 px-4">Quota</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map((p) => (
                    <tr key={p.rank} className="border-b border-border hover:bg-surface-hover/50 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-text-subtle">{p.rank}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium">{p.twitter.name || p.twitter.username}</div>
                        <div className="text-xs text-text-subtle">
                          @{p.twitter.username || "?"}
                          {p.twitter.verified && <span className="ml-1 text-brand">verified</span>}
                          <span className="ml-1">· {p.twitter.followersCount.toLocaleString()} followers</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">
                        {p.wallet ? (
                          <span className="text-text-secondary" title={p.wallet}>
                            {p.wallet.slice(0, 6)}...{p.wallet.slice(-4)}
                          </span>
                        ) : (
                          <span className="text-text-subtle">--</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-accent-long">{p.score.best}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-info">{p.mindsharePercent}%</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="font-semibold text-brand">{p.quota.toLocaleString()}</span>
                        <span className="text-xs text-text-subtle ml-1">Quota</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
