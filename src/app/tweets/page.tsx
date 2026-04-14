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
      className="block w-80 bg-surface-card border border-border-strong rounded-2xl p-4 shadow-2xl shadow-black/50 hover:border-brand/40 transition-colors cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-surface-secondary" />
          )}
          <span className="text-xs text-text-tertiary">@{author.username}</span>
          <span className="text-xs text-text-tertiary">{new Date(tweet.createdAt).toLocaleDateString()}</span>
        </div>
        <svg className="w-3.5 h-3.5 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed mb-3 line-clamp-5">
        {tweet.text}
      </p>
      <div className="flex items-center gap-3 text-xs text-text-tertiary mb-2">
        <span>{tweet.likes} likes</span>
        <span>{tweet.replies} replies</span>
        <span>{tweet.retweets} RTs</span>
        <span>{tweet.quotes} quotes</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 bg-brand/10 text-brand rounded-lg font-medium" title="AI content quality rating">Content {tweet.quality.toFixed(1)}</span>
        {tweet.engagementPending ? (
          <span className="px-2 py-0.5 bg-accent-yellow/10 text-accent-yellow rounded-lg flex items-center gap-1 font-medium" title="Based on likes, replies, retweets and quotes">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
            Engagement --
          </span>
        ) : (
          <span className="px-2 py-0.5 bg-accent-cyan/10 text-accent-cyan rounded-lg font-medium" title="Based on likes, replies, retweets and quotes">Engagement {tweet.engagement.toFixed(1)}</span>
        )}
        <span className="px-2 py-0.5 bg-accent-green/10 text-accent-green rounded-lg font-medium" title="Final score after trust adjustment">Score {tweet.score.toFixed(1)}{tweet.engagementPending && <span className="text-text-tertiary">*</span>}</span>
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
      className="absolute z-50 left-12 bottom-full mb-1 hidden group-hover:block"
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
                  ? "bg-brand text-white"
                  : "bg-surface-secondary text-text-tertiary hover:bg-surface-elevated"
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
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-card border border-border rounded-xl">
      <div className="text-xs text-text-tertiary">{label} ends in</div>
      <div className="text-sm font-mono font-semibold text-brand tabular-nums">{timeLeft}</div>
    </div>
  );
}

function MyCard({ data }: { data: PageData | null }) {
  const { data: session } = useSession();
  const [viewer, setViewer] = useState<{
    username: string;
    displayName: string;
    avatarUrl: string | null;
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
    <div className="bg-surface-card border border-border rounded-2xl px-6 py-4 mb-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          {viewer.avatarUrl ? (
            <img src={viewer.avatarUrl} alt="" className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-surface-secondary" />
          )}
          {myEntry && (
            <span className="absolute -bottom-1 -left-1 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-brand text-white">
              {myEntry.rank}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="font-semibold text-lg truncate">{viewer.displayName}</div>
          <div className="text-sm text-text-tertiary">@{viewer.username}</div>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-4 ml-8">
          <div className="text-center">
            <div className="text-xs text-text-tertiary">Mindshare</div>
            <div className="text-lg font-semibold text-accent-cyan">
              {myEntry ? `${myEntry.mindsharePercent}%` : "-"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-tertiary">Daily Rewards</div>
            <div className="text-lg font-semibold text-accent-green">
              {myEntry ? myEntry.dailyReward.toLocaleString() : "0"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-tertiary">Total Earned</div>
            <div className="text-lg font-semibold">
              {myEntry ? myEntry.totalReward.toLocaleString() : "0"}
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent("@LeverUp_xyz ")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold rounded-[56px] transition-colors"
          >
            Post
          </a>
          <Link
            href={`/creators/${viewer.username}`}
            className="px-5 py-2 bg-surface-secondary hover:bg-surface-elevated text-text-primary text-sm font-semibold rounded-[56px] transition-colors"
          >
            Details
          </Link>
        </div>
      </div>
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
        <MyCard data={data} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Mindshare Creators</h1>
            <p className="text-sm text-text-tertiary mt-1">
              Ranked by total score from scored tweets
            </p>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <div className="flex gap-4 text-sm text-text-tertiary">
                <span>{data.totalParticipants} creators</span>
                <span>Daily Pool: <span className="text-brand font-semibold">{data.dailyPool?.toLocaleString()} LVMON</span></span>
              </div>
            )}
            <EpochCountdown durationHours={data?.epochDurationHours || 24} />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-16 bg-surface-elevated rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-16 text-text-tertiary">
            <p className="text-lg">No scored creators yet</p>
            <p className="text-sm mt-1">Tweets need to be scanned and scored first.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="hidden md:grid grid-cols-[3rem_1fr_12rem_5rem_7rem_7rem] gap-4 items-center px-4 py-2 text-xs text-text-tertiary uppercase tracking-wider border-b border-border">
              <div>#</div>
              <div>Account</div>
              <div className="text-center">Score</div>
              <div className="text-right">Share</div>
              <div className="text-right">Daily</div>
              <div className="text-right">Total</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {data.items.map((item) => (
                <div
                  key={item.username}
                  className="group relative grid grid-cols-[3rem_1fr_12rem_5rem_7rem_7rem] gap-4 items-center px-4 py-3 hover:bg-surface-elevated/50 transition-colors"
                >
                  <div className="relative">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-secondary" />
                    )}
                    <span
                      className={`absolute -bottom-1 -left-1 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                        item.rank <= 3
                          ? "bg-accent-yellow text-black"
                          : "bg-surface-secondary text-text-secondary"
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
                        className="text-text-tertiary hover:text-text-secondary cursor-pointer shrink-0"
                        onClick={() => window.open(`https://x.com/${item.username}`, "_blank")}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </span>
                    </div>
                    <div className="text-xs text-text-tertiary truncate">
                      @{item.username}
                      {item.tweetCount > 1 && (
                        <span className="ml-1 text-text-tertiary">· {item.tweetCount} tweets ({item.tweetCount - 1} not counted)</span>
                      )}
                    </div>
                  </div>

                  {/* Best Tweet Score — unified card */}
                  <div className="bg-surface-elevated/50 border border-border rounded-xl px-2 py-1.5">
                    <div className="flex items-center">
                      <div className="flex-1 text-center border-r border-border px-1" title="AI content quality rating (relevance, originality, format)">
                        <div className="text-[10px] text-text-tertiary leading-none mb-0.5 flex items-center justify-center gap-0.5">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                          Content
                        </div>
                        <div className="text-xs font-mono font-medium text-brand">{item.totalQuality.toFixed(1)}</div>
                      </div>
                      <div className="flex-1 text-center border-r border-border px-1" title="Engagement score based on likes, replies, retweets and quotes">
                        <div className="text-[10px] text-text-tertiary leading-none mb-0.5 flex items-center justify-center gap-0.5">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
                          Engage
                        </div>
                        {item.hasEngagementPending ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-accent-yellow animate-pulse" />
                            <span className="text-xs font-mono text-accent-yellow">--</span>
                          </div>
                        ) : (
                          <div className="text-xs font-mono font-medium text-accent-cyan">{item.totalEngagement.toFixed(1)}</div>
                        )}
                      </div>
                      <div className="flex-1 text-center px-1" title="Final score after trust adjustment">
                        <div className="text-[10px] text-text-tertiary leading-none mb-0.5">Score</div>
                        <div className="text-xs font-mono font-semibold text-accent-green">{item.totalScore.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Mindshare */}
                  <div className="text-right text-sm text-accent-cyan font-mono">
                    {item.mindsharePercent}%
                  </div>

                  {/* Daily Reward */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-accent-green">
                      {item.dailyReward.toLocaleString()}
                    </span>
                    <span className="text-xs text-text-tertiary ml-1">LVMON</span>
                  </div>

                  {/* Total Reward */}
                  <div className="text-right">
                    <span className="text-sm font-mono text-text-secondary">
                      {item.totalReward.toLocaleString()}
                    </span>
                    <span className="text-xs text-text-tertiary ml-1">LVMON</span>
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
          </>
        )}
      </main>
    </>
  );
}
