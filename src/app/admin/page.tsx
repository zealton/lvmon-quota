"use client";

import { Header } from "@/components/header";
import { AdminTabs } from "@/components/admin-tabs";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

interface DashboardData {
  totalUsers: number;
  totalTweets: number;
  tweetsByStatus: Record<string, number>;
  currentConfig: { search_handle: string; max_search_results: number; daily_quota_pool: number; epoch_duration_hours: number; tweet_observation_window_hours: number };
  recentPools: { date: string; amount: number; totalScore: number; status: string }[];
  recentJobs: { id: string; name: string; status: string; startedAt: string; endedAt: string | null; result: any; error: string | null }[];
}

interface SchedulerJobState {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  running: boolean;
}

interface SchedulerState {
  tweetIngest: SchedulerJobState;
  tweetScore: SchedulerJobState;
  epochSettle: SchedulerJobState;
}

function RecentJobRuns({ jobs }: { jobs: DashboardData["recentJobs"] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-surface-1 border border-border rounded-md p-6">
      <h2 className="font-semibold mb-4">Recent Job Runs</h2>
      {jobs.length === 0 ? (
        <div className="text-sm text-text-subtle py-4 text-center">No jobs have been run yet.</div>
      ) : (
        <div className="space-y-0">
          {/* Header */}
          <div className="grid grid-cols-[1fr_5rem_10rem_2rem] gap-4 items-center px-4 py-2 text-xs text-text-subtle uppercase tracking-wider border-b border-border">
            <div>Job</div>
            <div>Status</div>
            <div>Started</div>
            <div></div>
          </div>
          {jobs.map((j) => {
            const isExpanded = expandedId === j.id;
            const hasContent = j.result || j.error;
            return (
              <div key={j.id} className="border-b border-border">
                <div
                  className={`grid grid-cols-[1fr_5rem_10rem_2rem] gap-4 items-center px-4 py-2.5 transition-colors ${
                    hasContent ? "cursor-pointer hover:bg-surface-hover/50" : ""
                  }`}
                  onClick={() => hasContent && setExpandedId(isExpanded ? null : j.id)}
                >
                  <div className="font-medium text-sm">{j.name}</div>
                  <div>
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                      j.status === "completed" ? "bg-accent-long/10 text-accent-long" :
                      j.status === "failed" ? "bg-accent-short/10 text-accent-short" :
                      "bg-warning/10 text-warning"
                    }`}>
                      {j.status}
                    </span>
                  </div>
                  <div className="text-text-subtle text-xs">{new Date(j.startedAt).toLocaleString()}</div>
                  <div className="text-text-subtle">
                    {hasContent && (
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                      </svg>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className={`px-4 pb-3 ${j.error ? "text-accent-short" : "text-text-secondary"}`}>
                    <pre className="text-xs font-mono bg-surface-hover rounded p-3 whitespace-pre-wrap overflow-x-auto">
                      {j.error || JSON.stringify(j.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [jobRunning, setJobRunning] = useState<string | null>(null);
  const [lastJobResult, setLastJobResult] = useState<{ job: string; result: any } | null>(null);

  // Editable interval inputs
  const [ingestInterval, setIngestInterval] = useState(15);
  const [scoreInterval, setScoreInterval] = useState(30);
  const [settleInterval, setSettleInterval] = useState(5);

  const fetchDashboard = useCallback(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  const fetchScheduler = useCallback(() => {
    fetch("/api/admin/scheduler")
      .then((r) => r.json())
      .then((s: SchedulerState) => {
        setScheduler(s);
        setIngestInterval(s.tweetIngest.intervalMinutes);
        setScoreInterval(s.tweetScore.intervalMinutes);
        setSettleInterval(s.epochSettle.intervalMinutes);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchScheduler();
  }, [fetchDashboard, fetchScheduler]);

  // Refresh scheduler state every 10s
  useEffect(() => {
    const id = setInterval(fetchScheduler, 10000);
    return () => clearInterval(id);
  }, [fetchScheduler]);

  const toggleScheduler = async (jobKey: "tweetIngest" | "tweetScore" | "epochSettle", enabled: boolean, intervalMinutes: number) => {
    const res = await fetch("/api/admin/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobKey, enabled, intervalMinutes }),
    });
    const result = await res.json();
    if (result.state) setScheduler(result.state);
  };

  const updateInterval = async (jobKey: "tweetIngest" | "tweetScore" | "epochSettle", intervalMinutes: number) => {
    const enabled = scheduler?.[jobKey]?.enabled;
    await toggleScheduler(jobKey, !!enabled, intervalMinutes);
  };

  const triggerJob = async (job: string) => {
    if (!confirm(`Run "${job}" now?`)) return;
    setJobRunning(job);
    setLastJobResult(null);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, secret: "dev-cron-secret" }),
      });
      const result = await res.json();

      if (result.status === "already_running") {
        setLastJobResult({ job, result: { message: "Job is already running" } });
        setJobRunning(null);
        return;
      }

      // Job started in background — poll for completion
      setLastJobResult({ job, result: { message: "Job started..." } });
      const pollInterval = setInterval(async () => {
        const dashRes = await fetch("/api/admin/dashboard").then((r) => r.json());
        setData(dashRes);

        // Check if the latest job run for this job name has completed
        const latestRun = dashRes.recentJobs?.find((j: any) => j.name === job);
        if (latestRun && latestRun.status !== "running") {
          clearInterval(pollInterval);
          setJobRunning(null);
          setLastJobResult({ job, result: latestRun.result || { status: latestRun.status, error: latestRun.error } });
          fetchScheduler();
        }
      }, 2000);

      // Safety timeout: stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (jobRunning) {
          setJobRunning(null);
          setLastJobResult({ job, result: { message: "Job still running in background. Check Recent Job Runs for results." } });
        }
      }, 300000);
    } catch (err) {
      setLastJobResult({ job, result: { error: String(err) } });
      setJobRunning(null);
    }
  };

  if (!data) return <div className="p-8 text-center text-text-subtle">Loading dashboard...</div>;

  const obsWindow = data.currentConfig?.tweet_observation_window_hours || 0.5;
  const epochHours = data.currentConfig?.epoch_duration_hours || 24;

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AdminTabs />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-surface-1 border border-border rounded-md p-4">
            <div className="text-xs text-text-subtle">Search Handle</div>
            <div className="text-lg font-bold text-brand">{data.currentConfig?.search_handle || "@LeverUp_xyz"}</div>
          </div>
          <div className="bg-surface-1 border border-border rounded-md p-4">
            <div className="text-xs text-text-subtle">Epoch LVMON Quota</div>
            <div className="text-2xl font-bold">{data.currentConfig?.daily_quota_pool?.toLocaleString() || 1000}</div>
          </div>
          <div className="bg-surface-1 border border-border rounded-md p-4">
            <div className="text-xs text-text-subtle">Total Users</div>
            <div className="text-2xl font-bold">{data.totalUsers}</div>
          </div>
          <div className="bg-surface-1 border border-border rounded-md p-4">
            <div className="text-xs text-text-subtle">Tweets (Scored)</div>
            <div className="text-2xl font-bold text-accent-long">
              {(data.tweetsByStatus?.["scored"] || 0) + (data.tweetsByStatus?.["settled"] || 0)}
              <span className="text-sm text-text-subtle font-normal"> / {data.totalTweets || 0}</span>
            </div>
          </div>
          <div className="bg-surface-1 border border-border rounded-md p-4">
            <div className="text-xs text-text-subtle">Quality Scored</div>
            <div className="text-2xl font-bold text-brand">
              {data.tweetsByStatus?.["quality_scored"] || 0}
            </div>
          </div>
        </div>

        {/* Pipeline Explanation */}
        <div className="bg-surface-1 border border-border rounded-md p-6 mb-8">
          <h2 className="font-semibold mb-3">Scoring Pipeline</h2>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-3 rounded">
              <div className={`w-2 h-2 rounded ${scheduler?.tweetIngest.enabled ? "bg-accent-long" : "bg-text-tertiary"}`} />
              <div>
                <div className="font-medium">Scan + Quality</div>
                <div className="text-xs text-text-subtle">
                  {scheduler?.tweetIngest.enabled
                    ? <span className="text-accent-long">Auto every {scheduler.tweetIngest.intervalMinutes}min</span>
                    : <span>Manual only</span>
                  }
                </div>
              </div>
            </div>
            <svg className="w-5 h-5 text-text-subtle shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" /></svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border border-accent-yellow/20 rounded">
              <div className="w-2 h-2 rounded bg-warning animate-pulse" />
              <div>
                <div className="font-medium text-warning">
                  Observation Window: {obsWindow >= 1 ? `${obsWindow}h` : `${obsWindow * 60}min`}
                </div>
                <div className="text-xs text-text-subtle">Engagement data accumulates</div>
              </div>
            </div>
            <svg className="w-5 h-5 text-text-subtle shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" /></svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-3 rounded">
              <div className={`w-2 h-2 rounded ${scheduler?.tweetScore.enabled ? "bg-accent-long" : "bg-text-tertiary"}`} />
              <div>
                <div className="font-medium">Engagement Score</div>
                <div className="text-xs text-text-subtle">
                  {scheduler?.tweetScore.enabled
                    ? <span className="text-accent-long">Auto every {scheduler.tweetScore.intervalMinutes}min — re-evaluates until settled</span>
                    : <span>Manual only — re-evaluates until settled</span>
                  }
                </div>
              </div>
            </div>
            <svg className="w-5 h-5 text-text-subtle shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" /></svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-3 rounded">
              <div className={`w-2 h-2 rounded ${scheduler?.epochSettle.enabled ? "bg-accent-long" : "bg-text-subtle"}`} />
              <div>
                <div className="font-medium">Settlement + CSV</div>
                <div className="text-xs text-text-subtle">
                  {scheduler?.epochSettle.enabled
                    ? <span className="text-accent-long">Auto every {scheduler.epochSettle.intervalMinutes}min</span>
                    : <span>Manual only</span>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Auto Scheduler */}
        <div className="bg-surface-1 border border-accent-long/20 rounded-md p-6 mb-8">
          <h2 className="font-semibold mb-1">Auto Scheduler</h2>
          <p className="text-xs text-text-subtle mb-5">
            Enable automatic scanning and scoring. When active, jobs run on the configured interval.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Ingest Scheduler */}
            <div className={`border rounded-md p-5 transition-colors ${
              scheduler?.tweetIngest.enabled
                ? "border-accent-green/30 bg-accent-long/5"
                : "border-border bg-surface-hover"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-sm">Tweet Scan + Quality Score</div>
                  <div className="text-xs text-text-subtle mt-0.5">
                    Searches X for new tweets, then immediately scores content quality via AI
                  </div>
                </div>
                <button
                  onClick={() => toggleScheduler("tweetIngest", !scheduler?.tweetIngest.enabled, ingestInterval)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    scheduler?.tweetIngest.enabled ? "bg-accent-long" : "bg-surface-3"
                  }`}
                >
                  <div className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    scheduler?.tweetIngest.enabled ? "translate-x-[24px]" : "translate-x-0"
                  }`} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-text-subtle">Every</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={ingestInterval}
                  onChange={(e) => setIngestInterval(parseInt(e.target.value) || 15)}
                  onBlur={() => updateInterval("tweetIngest", ingestInterval)}
                  className="w-20 bg-surface-dark border border-border rounded px-3 py-1.5 text-sm text-center focus:border-accent-long focus:outline-none"
                />
                <label className="text-xs text-text-subtle">minutes</label>
              </div>

              {scheduler?.tweetIngest.lastRunAt && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-text-subtle">
                  <span className={`w-1.5 h-1.5 rounded ${
                    scheduler.tweetIngest.running ? "bg-warning animate-pulse" :
                    scheduler.tweetIngest.lastRunStatus === "completed" ? "bg-accent-long" : "bg-accent-short"
                  }`} />
                  {scheduler.tweetIngest.running ? "Running now..." : (
                    <>Last run: {new Date(scheduler.tweetIngest.lastRunAt).toLocaleString()} ({scheduler.tweetIngest.lastRunStatus})</>
                  )}
                </div>
              )}
            </div>

            {/* Score Scheduler */}
            <div className={`border rounded-md p-5 transition-colors ${
              scheduler?.tweetScore.enabled
                ? "border-accent-green/30 bg-accent-long/5"
                : "border-border bg-surface-hover"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-sm">Engagement Score</div>
                  <div className="text-xs text-text-subtle mt-0.5">
                    First score after {obsWindow >= 1 ? `${obsWindow}h` : `${obsWindow * 60}min`} window, then re-evaluates all unsettled tweets each run
                  </div>
                </div>
                <button
                  onClick={() => toggleScheduler("tweetScore", !scheduler?.tweetScore.enabled, scoreInterval)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    scheduler?.tweetScore.enabled ? "bg-accent-long" : "bg-surface-3"
                  }`}
                >
                  <div className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    scheduler?.tweetScore.enabled ? "translate-x-[24px]" : "translate-x-0"
                  }`} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-text-subtle">Every</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={scoreInterval}
                  onChange={(e) => setScoreInterval(parseInt(e.target.value) || 30)}
                  onBlur={() => updateInterval("tweetScore", scoreInterval)}
                  className="w-20 bg-surface-dark border border-border rounded px-3 py-1.5 text-sm text-center focus:border-accent-long focus:outline-none"
                />
                <label className="text-xs text-text-subtle">minutes</label>
              </div>

              {scheduler?.tweetScore.lastRunAt && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-text-subtle">
                  <span className={`w-1.5 h-1.5 rounded ${
                    scheduler.tweetScore.running ? "bg-warning animate-pulse" :
                    scheduler.tweetScore.lastRunStatus === "completed" ? "bg-accent-long" : "bg-accent-short"
                  }`} />
                  {scheduler.tweetScore.running ? "Running now..." : (
                    <>Last run: {new Date(scheduler.tweetScore.lastRunAt).toLocaleString()} ({scheduler.tweetScore.lastRunStatus})</>
                  )}
                </div>
              )}
            </div>

            {/* Epoch Settlement Scheduler */}
            <div className={`border rounded-md p-5 transition-colors ${
              scheduler?.epochSettle.enabled
                ? "border-accent-long/30 bg-accent-long-bg"
                : "border-border bg-surface-2"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-sm">Epoch Settlement</div>
                  <div className="text-xs text-text-subtle mt-0.5">
                    Auto-settles at each epoch boundary and exports CSV
                  </div>
                </div>
                <button
                  onClick={() => {
                    const intervalMin = Math.max(1, Math.round(epochHours * 60));
                    toggleScheduler("epochSettle", !scheduler?.epochSettle.enabled, intervalMin);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    scheduler?.epochSettle.enabled ? "bg-accent-long" : "bg-surface-3"
                  }`}
                >
                  <div className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    scheduler?.epochSettle.enabled ? "translate-x-[24px]" : "translate-x-0"
                  }`} />
                </button>
              </div>

              <div className="text-xs text-text-subtle">
                Settles every <span className="text-text-primary font-medium">{epochHours >= 1 ? `${epochHours}h` : `${epochHours * 60}min`}</span>
                <span className="text-text-faint ml-1">— synced with Epoch Duration in Config</span>
              </div>

              {scheduler?.epochSettle.lastRunAt && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-text-subtle">
                  <span className={`w-1.5 h-1.5 rounded ${
                    scheduler.epochSettle.running ? "bg-warning animate-pulse" :
                    scheduler.epochSettle.lastRunStatus === "completed" ? "bg-accent-long" : "bg-accent-short"
                  }`} />
                  {scheduler.epochSettle.running ? "Running now..." : (
                    <>Last run: {new Date(scheduler.epochSettle.lastRunAt).toLocaleString()} ({scheduler.epochSettle.lastRunStatus})</>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Manual Triggers */}
        <div className="bg-surface-1 border border-border rounded-md p-6 mb-8">
          <h2 className="font-semibold mb-1">Manual Triggers</h2>
          <p className="text-xs text-text-subtle mb-4">
            Run jobs immediately, regardless of scheduler state.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { job: "tweet-ingest", label: "Scan + Quality", desc: "Scan X, score quality" },
              { job: "tweet-score", label: "Engagement Score", desc: "Score past window" },
              { job: "daily-settlement", label: "Settlement", desc: "Distribute quota" },
              { job: "quota-expiry", label: "Expire Quota", desc: "Expire old quota" },
              { job: "x-profile-refresh", label: "Refresh Profiles", desc: "Update X profiles" },
            ].map(({ job, label, desc }) => (
              <button
                key={job}
                onClick={() => triggerJob(job)}
                disabled={jobRunning !== null}
                className={`text-left p-4 rounded transition-all border ${
                  jobRunning === job
                    ? "bg-surface-hover border-border animate-pulse"
                    : jobRunning !== null
                    ? "bg-surface-1 border-border opacity-50 cursor-not-allowed"
                    : "bg-surface-3 border-border hover:border-accent-long hover:bg-surface-hover"
                }`}
              >
                <div className="font-medium text-sm">
                  {jobRunning === job ? "Running..." : label}
                </div>
                <div className="text-xs text-text-subtle mt-1">{desc}</div>
              </button>
            ))}
          </div>

          {lastJobResult && (
            <div className={`mt-4 p-4 rounded text-sm font-mono border ${
              lastJobResult.result?.error
                ? "bg-accent-short/5 border-accent-red/20 text-accent-short"
                : "bg-accent-long/5 border-accent-green/20 text-accent-long"
            }`}>
              <div className="text-xs text-text-subtle mb-1">Result: {lastJobResult.job}</div>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(lastJobResult.result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Recent Pools */}
        <div className="bg-surface-1 border border-border rounded-md p-6 mb-8">
          <h2 className="font-semibold mb-4">Recent Quota Pools</h2>
          {data.recentPools.length === 0 ? (
            <div className="text-sm text-text-subtle py-4 text-center">No settlement data yet. Run "Settlement" to start.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-subtle border-b border-border">
                  <th className="text-left py-2">Date</th>
                  <th className="text-right py-2">Amount</th>
                  <th className="text-right py-2">Total Score</th>
                  <th className="text-right py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPools.map((p) => (
                  <tr key={p.date} className="border-b border-border">
                    <td className="py-2">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="text-right">{p.amount.toLocaleString()}</td>
                    <td className="text-right">{p.totalScore.toFixed(1)}</td>
                    <td className="text-right">
                      <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                        p.status === "settled" ? "bg-accent-long/10 text-accent-long" :
                        p.status === "empty" ? "bg-surface-3 text-text-subtle" :
                        "bg-warning/10 text-warning"
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
        <RecentJobRuns jobs={data.recentJobs} />
      </main>
    </>
  );
}
