"use client";

import { Header } from "@/components/header";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface TweetDetail {
  tweetId: string;
  text: string;
  createdAt: string;
  hasMedia: boolean;
  score: number;
  quality: number;
  engagement: number;
  engagementPending?: boolean;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
}

interface AuthorItem {
  rank: number;
  username: string;
  name: string;
  avatarUrl: string | null;
  totalScore: number;
  totalQuality: number;
  totalEngagement: number;
  hasEngagementPending: boolean;
  bestScore: number;
  mindsharePercent: number;
  dailyReward: number;
  totalReward: number;
  tweetCount: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  totalQuotes: number;
  tweets: TweetDetail[];
}

interface PageData {
  items: AuthorItem[];
  totalParticipants: number;
  totalScore: number;
  dailyPool: number;
  epochDurationHours: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function TweetPopup({ tweet, author }: { tweet: TweetDetail; author: { username: string; avatarUrl: string | null } }) {
  return (
    <a
      href={`https://x.com/${author.username}/status/${tweet.tweetId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-80 bg-surface-1 border border-border-strong rounded-md p-3 shadow-lg shadow-black/60 hover:border-accent-long/30 transition-colors cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt="" className="w-5 h-5 rounded" />
          ) : (
            <div className="w-5 h-5 rounded bg-surface-3" />
          )}
          <span className="text-[11px] text-text-subtle">@{author.username}</span>
          <span className="text-[11px] text-text-faint">{new Date(tweet.createdAt).toLocaleDateString()}</span>
        </div>
        <svg className="w-3 h-3 text-text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed mb-2 line-clamp-5">
        {tweet.text}
      </p>
      <div className="flex items-center gap-3 text-[10px] text-text-subtle mb-2">
        <span>{tweet.likes} likes</span>
        <span>{tweet.replies} replies</span>
        <span>{tweet.retweets} RTs</span>
        <span>{tweet.quotes} quotes</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="px-1.5 py-0.5 bg-info/10 text-info rounded font-medium">Q {tweet.quality.toFixed(1)}</span>
        {tweet.engagementPending ? (
          <span className="px-1.5 py-0.5 bg-warning/10 text-warning rounded flex items-center gap-1 font-medium">
            <span className="w-1 h-1 rounded bg-warning animate-pulse" />
            E --
          </span>
        ) : (
          <span className="px-1.5 py-0.5 bg-accent-long-bg text-accent-long rounded font-medium">E {tweet.engagement.toFixed(1)}</span>
        )}
        <span className="px-1.5 py-0.5 bg-accent-long-bg text-accent-long-strong rounded font-medium">
          {tweet.score.toFixed(1)}{tweet.engagementPending && <span className="text-text-faint">*</span>}
        </span>
      </div>
    </a>
  );
}

function HoverTweets({
  tweets,
  author,
}: {
  tweets: TweetDetail[];
  author: { username: string; avatarUrl: string | null };
}) {
  const [popupTweet, setPopupTweet] = useState<TweetDetail | null>(null);

  if (tweets.length === 0) return null;

  return (
    <div
      className="absolute z-50 left-12 bottom-full mb-1 hidden group-hover:block pointer-events-auto"
      onMouseEnter={() => setPopupTweet(tweets[0])}
    >
      <TweetPopup tweet={popupTweet || tweets[0]} author={author} />
      {tweets.length > 1 && (
        <div className="flex gap-1 mt-1">
          {tweets.slice(0, 5).map((t, i) => (
            <button
              key={t.tweetId}
              onMouseEnter={() => setPopupTweet(t)}
              className={`w-6 h-6 rounded-lg text-xs transition-colors ${
                (popupTweet || tweets[0]).tweetId === t.tweetId
                  ? "bg-accent-long text-bg-canvas"
                  : "bg-surface-3 text-text-subtle hover:bg-surface-hover"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EpochCountdown({ durationHours }: { durationHours: number }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = new Date();
      const cstOffset = 8 * 60 * 60 * 1000;
      const nowCST = new Date(now.getTime() + cstOffset);
      const durationMs = durationHours * 60 * 60 * 1000;

      // Calculate epoch start: floor current CST time to the nearest epoch boundary
      const epochStartCST = new Date(
        Math.floor(nowCST.getTime() / durationMs) * durationMs
      );
      const epochEndCST = new Date(epochStartCST.getTime() + durationMs);
      const epochEndUTC = new Date(epochEndCST.getTime() - cstOffset);

      const diff = epochEndUTC.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeft("Settling...");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [durationHours]);

  const label = durationHours >= 24 ? "Epoch" : `Epoch (${durationHours}h)`;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-1 border border-border rounded">
      <div className="text-[11px] text-text-subtle">{label} ends in</div>
      <div className="text-sm font-mono font-semibold text-accent-long tabular-nums">{timeLeft}</div>
    </div>
  );
}

function HeroBanner({ data }: { data: PageData | null }) {
  const [apy, setApy] = useState<number | null>(null);
  const [epochNumber, setEpochNumber] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/public/apy")
      .then((r) => r.json())
      .then((d) => setApy(d.apy))
      .catch(() => {});
    fetch("/api/epoch/current")
      .then((r) => r.json())
      .then((d) => { if (d.epoch?.number) setEpochNumber(d.epoch.number); })
      .catch(() => {});
  }, []);

  return (
    <div className="grid-bg border border-border rounded-md p-6 mb-4">
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold mb-1.5 font-display tracking-wide">TWEET TO EARN STAKE QUOTA</h1>
        <p className="text-sm text-text-muted">
          Mention <span className="text-accent-long font-medium">@LeverUp_xyz</span> on X — get scored — earn LVMON Stake quota
        </p>
      </div>

      {/* 3-step flow */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-1 border border-border rounded">
          <span className="w-5 h-5 flex items-center justify-center bg-accent-long/10 text-accent-long rounded text-[10px] font-bold">1</span>
          <div>
            <div className="text-xs font-semibold text-text-primary">Tweet</div>
            <div className="text-[10px] text-text-subtle">Mention @LeverUp_xyz</div>
          </div>
        </div>
        <span className="text-text-faint text-xs">→</span>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-1 border border-border rounded">
          <span className="w-5 h-5 flex items-center justify-center bg-info/10 text-info rounded text-[10px] font-bold">2</span>
          <div>
            <div className="text-xs font-semibold text-text-primary">Score</div>
            <div className="text-[10px] text-text-subtle">AI + Engagement</div>
          </div>
        </div>
        <span className="text-text-faint text-xs">→</span>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-1 border border-border rounded">
          <span className="w-5 h-5 flex items-center justify-center bg-accent-long/10 text-accent-long rounded text-[10px] font-bold">3</span>
          <div>
            <div className="text-xs font-semibold text-text-primary">Stake</div>
            <div className="text-[10px] text-text-subtle">Earn quota to stake</div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-center mb-5">
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent("@LeverUp_xyz ")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2 bg-accent-long hover:bg-accent-long-strong text-bg-canvas text-sm font-semibold rounded transition-colors"
        >
          Post on X Now
        </a>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-center gap-4 text-xs">
        {epochNumber !== null && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border rounded">
            <span className="text-text-subtle">Epoch</span>
            <span className="font-bold text-text-primary tabular-nums">#{epochNumber}</span>
          </div>
        )}
        {apy !== null && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-long-bg border border-accent-long/20 rounded">
            <span className="text-text-subtle">Stake APY</span>
            <span className="font-bold text-accent-long tabular-nums">{apy.toLocaleString()}%</span>
          </div>
        )}
        {data && (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border rounded">
              <span className="text-text-subtle">Epoch Pool</span>
              <span className="font-semibold text-text-primary tabular-nums">{data.dailyPool?.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border rounded">
              <span className="text-text-subtle">Creators</span>
              <span className="font-semibold text-text-primary tabular-nums">{data.totalParticipants}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MyCard({ data }: { data: PageData | null }) {
  const { data: session } = useSession();
  const [viewer, setViewer] = useState<{
    username: string;
    displayName: string;
    avatarUrl: string | null;
    walletAddress: string | null;
  } | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch("/api/viewer/summary")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setViewer(d);
      })
      .catch(() => {});
  }, [session]);

  if (!session || !viewer) return null;

  const myEntry = data?.items?.find(
    (item) => item.username.toLowerCase() === viewer.username?.toLowerCase()
  );

  return (
    <div className="bg-surface-1 border border-border rounded-md px-4 py-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          {viewer.avatarUrl ? (
            <img src={viewer.avatarUrl} alt="" className="w-10 h-10 rounded" />
          ) : (
            <div className="w-10 h-10 rounded bg-surface-3" />
          )}
          {myEntry && (
            <span className="absolute -bottom-1 -left-1 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold bg-accent-long text-bg-canvas">
              {myEntry.rank}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{viewer.displayName}</div>
          <div className="text-[11px] text-text-subtle">@{viewer.username}</div>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-3 ml-4">
          <div className="text-center">
            <div className="text-[10px] text-text-subtle">Mindshare</div>
            <div className="text-sm font-semibold text-info tabular-nums">
              {myEntry ? `${myEntry.mindsharePercent}%` : "-"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-text-subtle">Epoch Quota</div>
            <div className="text-sm font-semibold text-accent-long tabular-nums">
              {myEntry ? myEntry.dailyReward.toLocaleString() : "0"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-text-subtle">Total Quota</div>
            <div className="text-sm font-semibold tabular-nums">
              {myEntry ? myEntry.totalReward.toLocaleString() : "0"}
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 shrink-0">
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent("@LeverUp_xyz ")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-1.5 bg-accent-long hover:bg-accent-long-strong text-bg-canvas text-xs font-semibold rounded transition-colors"
          >
            Post
          </a>
          <Link
            href={`/creators/${viewer.username}`}
            className="px-4 py-1.5 bg-surface-3 hover:bg-surface-hover border border-border text-text-primary text-xs font-semibold rounded transition-colors"
          >
            Details
          </Link>
        </div>
      </div>

      {/* Wallet prompt */}
      {!viewer.walletAddress && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-warning/5 border border-warning/20 rounded text-xs">
          <svg className="w-3.5 h-3.5 text-warning shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
          <span className="text-warning">Connect your wallet to receive LVMON Stake quota</span>
          <span className="text-text-faint">— use the "Connect Wallet" button in the top right</span>
        </div>
      )}
    </div>
  );
}

export default function TweetsPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/tweets?mode=authors&page=${page}&limit=50`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  const maxScore = data?.items?.[0]?.totalScore || 1;

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HeroBanner data={data} />
        <MyCard data={data} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold">Stake Quota Leaderboard</h2>
            <p className="text-xs text-text-subtle mt-0.5">
              Your best tweet earns you LVMON Stake quota each epoch
            </p>
          </div>
          <EpochCountdown durationHours={data?.epochDurationHours || 24} />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface-1 rounded animate-pulse" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-16 text-text-subtle">
            <p className="text-lg">No scored creators yet</p>
            <p className="text-sm mt-1">Tweets need to be scanned and scored first.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="hidden md:grid grid-cols-[3rem_1fr_12rem_5rem_7rem_7rem] gap-4 items-center px-4 py-2 text-xs text-text-subtle uppercase tracking-wider border-b border-border">
              <div>#</div>
              <div>Account</div>
              <div className="text-center">Score</div>
              <div className="text-right">Share</div>
              <div className="text-right">Epoch Quota</div>
              <div className="text-right">Total Quota</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {data.items.map((item) => (
                <div
                  key={item.username}
                  className="group relative grid grid-cols-[3rem_1fr_12rem_5rem_7rem_7rem] gap-4 items-center px-4 py-3 hover:bg-surface-hover/50 transition-colors"
                >
                  <div className="relative">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt="" className="w-10 h-10 rounded" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-surface-3" />
                    )}
                    <span
                      className={`absolute -bottom-1 -left-1 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
                        item.rank <= 3
                          ? "bg-warning text-black"
                          : "bg-surface-3 text-text-secondary"
                      }`}
                    >
                      {item.rank}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/creators/${item.username}`}
                        className="font-medium text-sm truncate hover:text-brand transition-colors"
                      >
                        {item.name}
                      </Link>
                      <span
                        className="text-text-subtle hover:text-text-secondary cursor-pointer shrink-0"
                        onClick={() => window.open(`https://x.com/${item.username}`, "_blank")}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </span>
                    </div>
                    <div className="text-xs text-text-subtle truncate">
                      @{item.username}
                      {item.tweetCount > 1 && (
                        <span className="ml-1 text-text-subtle">· {item.tweetCount} tweets ({item.tweetCount - 1} not counted)</span>
                      )}
                    </div>
                  </div>

                  {/* Best Tweet Score — unified card */}
                  <div className="bg-surface-hover/50 border border-border rounded">
                    <div className="grid grid-cols-3 divide-x divide-border">
                      <div className="px-3 py-2 text-center" title="AI content quality rating (relevance, originality, format)">
                        <div className="text-[10px] text-text-subtle mb-1">Content</div>
                        <div className="text-sm font-mono font-medium text-info tabular-nums">{item.totalQuality.toFixed(1)}</div>
                      </div>
                      <div className="px-3 py-2 text-center" title="Engagement score — continuously updated based on likes, replies, retweets and quotes">
                        <div className="text-[10px] text-text-subtle mb-1">Engage</div>
                        {item.hasEngagementPending ? (
                          <div className="text-sm font-mono text-warning tabular-nums">--</div>
                        ) : (
                          <div className="text-sm font-mono font-medium text-text-primary engage-live tabular-nums">{item.totalEngagement.toFixed(1)}</div>
                        )}
                        <svg className="mt-1 mx-auto" width="24" height="6" viewBox="0 0 24 6">
                          <polyline
                            points="0,3 6,3 8,1 10,5 12,2 14,4 16,3 24,3"
                            fill="none"
                            stroke="#c7f50d"
                            strokeWidth="0.8"
                            opacity="0.4"
                            strokeDasharray="48"
                            style={{ animation: "ecg-sweep 2s linear infinite" }}
                          />
                        </svg>
                      </div>
                      <div className="px-3 py-2 text-center" title="Final score after trust adjustment">
                        <div className="text-[10px] text-text-subtle mb-1">Score</div>
                        <div className="text-sm font-mono font-semibold text-accent-long tabular-nums">{item.totalScore.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Mindshare */}
                  <div className="text-right text-sm text-info font-mono">
                    {item.mindsharePercent}%
                  </div>

                  {/* Epoch Quota */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-accent-long">
                      {item.dailyReward.toLocaleString()}
                    </span>
                  </div>

                  {/* Total Quota */}
                  <div className="text-right">
                    <span className="text-sm font-mono text-text-secondary">
                      {item.totalReward.toLocaleString()}
                    </span>
                  </div>

                  {/* Hover popup for tweets */}
                  <HoverTweets tweets={item.tweets} author={{ username: item.username, avatarUrl: item.avatarUrl }} />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-1.5 text-sm bg-surface-3 hover:bg-surface-hover rounded disabled:opacity-50 transition-colors"
                >
                  Prev
                </button>
                <span className="text-sm text-text-subtle">
                  {page} / {data.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                  disabled={page === data.pagination.totalPages}
                  className="px-4 py-1.5 text-sm bg-surface-3 hover:bg-surface-hover rounded disabled:opacity-50 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
