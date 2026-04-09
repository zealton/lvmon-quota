"use client";

import { Header } from "@/components/header";
import Link from "next/link";
import { useEffect, useState } from "react";

interface DashboardData {
  totalUsers: number;
  totalTweets: number;
  tweetsByStatus: Record<string, number>;
  currentConfig: { search_handle: string; max_search_results: number; daily_quota_pool: number };
  recentPools: { date: string; amount: number; totalScore: number; status: string }[];
  recentJobs: { id: string; name: string; status: string; startedAt: string; endedAt: string | null; result: any; error: string | null }[];
}

const JOB_DESCRIPTIONS: Record<string, { label: string; description: string; color: string }> = {
  "tweet-ingest": { label: "Scan Tweets", description: "Search X for new tweets mentioning the configured handle", color: "bg-blue-600 hover:bg-blue-500" },
  "tweet-score": { label: "Score Tweets", description: "Score eligible tweets that passed the observation window", color: "bg-purple-600 hover:bg-purple-500" },
  "daily-settlement": { label: "Daily Settlement", description: "Calculate quota distribution for yesterday", color: "bg-green-600 hover:bg-green-500" },
  "quota-expiry": { label: "Expire Quota", description: "Expire quota from week N at start of week N+2", color: "bg-orange-600 hover:bg-orange-500" },
  "x-profile-refresh": { label: "Refresh Profiles", description: "Update follower/following counts for bound users", color: "bg-cyan-600 hover:bg-cyan-500" },
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [jobRunning, setJobRunning] = useState<string | null>(null);
  const [lastJobResult, setLastJobResult] = useState<{ job: string; result: any } | null>(null);

  const fetchDashboard = () => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  };

  useEffect(() => { fetchDashboard(); }, []);

  const triggerJob = async (job: string) => {
    setJobRunning(job);
    setLastJobResult(null);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, secret: "dev-cron-secret" }),
      });
      const result = await res.json();
      setLastJobResult({ job, result });
      fetchDashboard();
    } catch (err) {
      setLastJobResult({ job, result: { error: String(err) } });
    } finally {
      setJobRunning(null);
    }
  };

  if (!data) return <div className="p-8 text-center text-gray-400">Loading dashboard...</div>;

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <div className="flex gap-3">
            <Link href="/admin/tweets" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
              Tweets
            </Link>
            <Link href="/admin/users" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
              Users
            </Link>
            <Link href="/admin/config" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
              Config
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">Search Handle</div>
            <div className="text-lg font-bold text-blue-400">{data.currentConfig?.search_handle || "@LeverUp_xyz"}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">Daily Pool</div>
            <div className="text-2xl font-bold">{data.currentConfig?.daily_quota_pool?.toLocaleString() || 1000}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">Total Users</div>
            <div className="text-2xl font-bold">{data.totalUsers}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">Tweets (Scored)</div>
            <div className="text-2xl font-bold text-green-400">
              {(data.tweetsByStatus?.["scored"] || 0) + (data.tweetsByStatus?.["settled"] || 0)}
              <span className="text-sm text-gray-500 font-normal"> / {data.totalTweets || 0}</span>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">Rejected</div>
            <div className="text-2xl font-bold text-red-400">
              {data.tweetsByStatus?.["rejected"] || 0}
            </div>
          </div>
        </div>

        {/* Manual Job Triggers - prominent section */}
        <div className="bg-gray-900 border border-purple-500/30 rounded-xl p-6 mb-8">
          <h2 className="font-semibold mb-1">Manual Operations</h2>
          <p className="text-xs text-gray-500 mb-4">
            Trigger background jobs manually. Search limit: {data.currentConfig?.max_search_results || 20} tweets per scan.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(JOB_DESCRIPTIONS).map(([job, info]) => (
              <button
                key={job}
                onClick={() => triggerJob(job)}
                disabled={jobRunning !== null}
                className={`text-left p-4 rounded-lg transition-all ${
                  jobRunning === job
                    ? "bg-gray-700 animate-pulse"
                    : jobRunning !== null
                    ? "bg-gray-800 opacity-50 cursor-not-allowed"
                    : info.color
                }`}
              >
                <div className="font-medium text-sm">
                  {jobRunning === job ? "Running..." : info.label}
                </div>
                <div className="text-xs text-white/60 mt-1">{info.description}</div>
              </button>
            ))}
          </div>

          {/* Job result display */}
          {lastJobResult && (
            <div className={`mt-4 p-4 rounded-lg text-sm font-mono ${
              lastJobResult.result?.error
                ? "bg-red-900/20 border border-red-500/30 text-red-300"
                : "bg-green-900/20 border border-green-500/30 text-green-300"
            }`}>
              <div className="text-xs text-gray-400 mb-1">Result: {lastJobResult.job}</div>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(lastJobResult.result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Recent Pools */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="font-semibold mb-4">Recent Quota Pools</h2>
          {data.recentPools.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center">No settlement data yet. Run "Daily Settlement" to start.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2">Date</th>
                  <th className="text-right py-2">Amount</th>
                  <th className="text-right py-2">Total Score</th>
                  <th className="text-right py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPools.map((p) => (
                  <tr key={p.date} className="border-b border-gray-800/50">
                    <td className="py-2">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="text-right">{p.amount.toLocaleString()}</td>
                    <td className="text-right">{p.totalScore.toFixed(1)}</td>
                    <td className="text-right">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        p.status === "settled" ? "bg-green-900/30 text-green-400" :
                        p.status === "empty" ? "bg-gray-800 text-gray-500" :
                        "bg-yellow-900/30 text-yellow-400"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Jobs */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Recent Job Runs</h2>
          {data.recentJobs.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center">No jobs have been run yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2">Job</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Started</th>
                  <th className="text-left py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.recentJobs.map((j) => (
                  <tr key={j.id} className="border-b border-gray-800/50">
                    <td className="py-2 font-medium">{j.name}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        j.status === "completed" ? "bg-green-900/30 text-green-400" :
                        j.status === "failed" ? "bg-red-900/30 text-red-400" :
                        "bg-yellow-900/30 text-yellow-400"
                      }`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-400 text-xs">{new Date(j.startedAt).toLocaleString()}</td>
                    <td className="py-2 text-xs max-w-xs truncate">
                      {j.error ? (
                        <span className="text-red-400">{j.error}</span>
                      ) : j.result ? (
                        <span className="text-gray-400">{JSON.stringify(j.result)}</span>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
