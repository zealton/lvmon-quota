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
  epoch: { date: string; status: string; poolSize: number; totalScore: number; participantCount: number };
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
            <p className="text-sm text-text-tertiary mt-1">View and export epoch data for LeverUp backend integration</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyJSON} disabled={!data} className="px-5 py-2 bg-surface-secondary hover:bg-surface-elevated disabled:opacity-50 rounded-[56px] text-sm font-medium transition-colors">
              Copy JSON
            </button>
            <button onClick={exportCSV} disabled={!data} className="px-5 py-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-[56px] text-sm font-medium transition-colors">
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
              className={`px-4 py-1.5 text-sm rounded-[56px] font-medium transition-colors ${
                mode === m ? "bg-brand text-white" : "bg-surface-secondary text-text-secondary hover:bg-surface-elevated"
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
              className="bg-surface-elevated border border-border rounded-xl px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          )}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface-elevated rounded-xl" />
            ))}
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-text-tertiary">
            <p className="text-lg">No epoch data found</p>
            <p className="text-sm mt-1">Run a daily settlement first, or switch to "Current (Live)" view.</p>
          </div>
        ) : (
          <>
            {/* Epoch summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-surface-card border border-border rounded-2xl p-4">
                <div className="text-xs text-text-tertiary">Epoch</div>
                <div className="text-lg font-bold">{data.epoch.date}</div>
                <div className={`text-xs font-medium mt-1 ${
                  data.epoch.status === "settled" ? "text-accent-green" :
                  data.epoch.status === "live" ? "text-accent-yellow" : "text-text-tertiary"
                }`}>{data.epoch.status}</div>
              </div>
              <div className="bg-surface-card border border-border rounded-2xl p-4">
                <div className="text-xs text-text-tertiary">Pool Size</div>
                <div className="text-lg font-bold text-brand">{data.epoch.poolSize.toLocaleString()} <span className="text-sm font-normal text-text-tertiary">LVMON</span></div>
              </div>
              <div className="bg-surface-card border border-border rounded-2xl p-4">
                <div className="text-xs text-text-tertiary">Total Score</div>
                <div className="text-lg font-bold">{data.epoch.totalScore}</div>
              </div>
              <div className="bg-surface-card border border-border rounded-2xl p-4">
                <div className="text-xs text-text-tertiary">Participants</div>
                <div className="text-lg font-bold">{data.epoch.participantCount}</div>
              </div>
            </div>

            {/* API endpoint info */}
            <div className="bg-surface-card border border-border rounded-2xl p-4 mb-6">
              <div className="text-xs text-text-tertiary mb-1">API Endpoint</div>
              <code className="text-sm text-accent-cyan font-mono break-all">
                GET /api/epoch/{data.epoch.date}
              </code>
            </div>

            {/* Participants table */}
            <div className="bg-surface-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-tertiary border-b border-border">
                    <th className="text-left py-3 px-4">#</th>
                    <th className="text-left py-3 px-4">Twitter</th>
                    <th className="text-left py-3 px-4">Wallet</th>
                    <th className="text-right py-3 px-4">Score</th>
                    <th className="text-right py-3 px-4">Mindshare</th>
                    <th className="text-right py-3 px-4">LVMON Quota</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map((p) => (
                    <tr key={p.rank} className="border-b border-border hover:bg-surface-elevated/50 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-text-tertiary">{p.rank}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium">{p.twitter.name || p.twitter.username}</div>
                        <div className="text-xs text-text-tertiary">
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
                          <span className="text-text-tertiary">--</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-accent-green">{p.score.best}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-accent-cyan">{p.mindsharePercent}%</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="font-semibold text-brand">{p.quota.toLocaleString()}</span>
                        <span className="text-xs text-text-tertiary ml-1">LVMON</span>
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
