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
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function TweetPopup({ tweet, author }: { tweet: TweetDetail; author: { username: string; avatarUrl: string | null } }) {
  return (
    <div className="w-80 bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-2xl shadow-black/50">
      <div className="flex items-center gap-2 mb-2">
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-700" />
        )}
        <span className="text-xs text-gray-400">@{author.username}</span>
        <span className="text-xs text-gray-600">{new Date(tweet.createdAt).toLocaleDateString()}</span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed mb-3 line-clamp-5">
        {tweet.text}
      </p>
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
        <span>{tweet.likes} likes</span>
        <span>{tweet.replies} replies</span>
        <span>{tweet.retweets} RTs</span>
        <span>{tweet.quotes} quotes</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-400 rounded">Q: {tweet.quality.toFixed(1)}</span>
        <span className="px-1.5 py-0.5 bg-blue-900/40 text-blue-400 rounded">E: {tweet.engagement.toFixed(1)}</span>
        <span className="px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded font-medium">Score: {tweet.score.toFixed(1)}</span>
      </div>
    </div>
  );
}

function ScoreBarWithHover({
  score,
  maxScore,
  tweets,
  author,
}: {
  score: number;
  maxScore: number;
  tweets: TweetDetail[];
  author: { username: string; avatarUrl: string | null };
}) {
  const [show, setShow] = useState(false);
  const [popupTweet, setPopupTweet] = useState<TweetDetail | null>(null);
  const pct = maxScore > 0 ? Math.min((score / maxScore) * 100, 100) : 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        setShow(true);
        setPopupTweet(tweets[0] || null);
      }}
      onMouseLeave={() => setShow(false)}
    >
      <div className="flex items-center gap-2 w-full cursor-pointer">
        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, #ef4444 0%, #f59e0b 30%, #eab308 50%, #22c55e 70%, #06b6d4 100%)`,
            }}
          />
        </div>
        <span className="text-sm font-mono w-16 text-right text-gray-300">{score.toFixed(1)}</span>
      </div>

      {show && popupTweet && (
        <div className="absolute z-50 bottom-full mb-2 left-0">
          <TweetPopup tweet={popupTweet} author={author} />
          {tweets.length > 1 && (
            <div className="flex gap-1 mt-1">
              {tweets.slice(0, 5).map((t, i) => (
                <button
                  key={t.tweetId}
                  onMouseEnter={() => setPopupTweet(t)}
                  className={`w-6 h-6 rounded text-xs transition-colors ${
                    popupTweet.tweetId === t.tweetId
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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

  // Find this user in the leaderboard data
  const myEntry = data?.items?.find(
    (item) => item.username.toLowerCase() === viewer.username?.toLowerCase()
  );

  return (
    <div className="bg-gray-900 border border-gray-700/50 rounded-xl px-6 py-4 mb-6">
      <div className="flex items-center gap-4">
        {/* Avatar + Rank */}
        <div className="relative">
          {viewer.avatarUrl ? (
            <img src={viewer.avatarUrl} alt="" className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-700" />
          )}
          {myEntry && (
            <span className="absolute -bottom-1 -left-1 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-purple-600 text-white">
              {myEntry.rank}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="min-w-0">
          <div className="font-semibold text-lg truncate">{viewer.displayName}</div>
          <div className="text-sm text-gray-400">@{viewer.username}</div>
        </div>

        {/* Stats */}
        <div className="flex-1 grid grid-cols-3 gap-4 ml-8">
          <div className="text-center">
            <div className="text-xs text-gray-500">Mindshare</div>
            <div className="text-lg font-semibold text-cyan-400">
              {myEntry ? `${myEntry.mindsharePercent}%` : "-"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Daily Rewards</div>
            <div className="text-lg font-semibold text-green-400">
              {myEntry ? myEntry.dailyReward.toLocaleString() : "0"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Total Earned</div>
            <div className="text-lg font-semibold">
              {myEntry ? myEntry.totalReward.toLocaleString() : "0"}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent("@LeverUp_xyz ")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Post ✨
          </a>
          <Link
            href={`/creators/${viewer.username}`}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Details →
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
            <p className="text-sm text-gray-500 mt-1">
              Ranked by total score from scored tweets
            </p>
          </div>
          {data && (
            <div className="flex gap-4 text-sm text-gray-400">
              <span>{data.totalParticipants} creators</span>
              <span>Daily Pool: <span className="text-cyan-400 font-medium">{data.dailyPool?.toLocaleString()} LVMON</span></span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No scored creators yet</p>
            <p className="text-sm mt-1">Tweets need to be scanned and scored first.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="hidden md:grid grid-cols-[3rem_1fr_minmax(10rem,1.5fr)_5rem_7rem_7rem] gap-4 items-center px-4 py-2 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <div>#</div>
              <div>Account</div>
              <div>Score</div>
              <div className="text-right">Share</div>
              <div className="text-right">Daily Reward</div>
              <div className="text-right">Total Reward</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-800/50">
              {data.items.map((item) => (
                <div
                  key={item.username}
                  className="grid grid-cols-[3rem_1fr_minmax(10rem,1.5fr)_5rem_7rem_7rem] gap-4 items-center px-4 py-3 hover:bg-gray-800/30 transition-colors"
                >
                  {/* Rank + Avatar */}
                  <div className="relative">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-700" />
                    )}
                    <span
                      className={`absolute -bottom-1 -left-1 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                        item.rank <= 3
                          ? "bg-yellow-500 text-black"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {item.rank}
                    </span>
                  </div>

                  {/* Account */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/creators/${item.username}`}
                        className="font-medium text-sm truncate hover:opacity-80"
                      >
                        {item.name}
                      </Link>
                      <span
                        className="text-gray-600 hover:text-gray-400 cursor-pointer shrink-0"
                        onClick={() => window.open(`https://x.com/${item.username}`, "_blank")}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      @{item.username}
                    </div>
                  </div>

                  {/* Score bar with hover popup */}
                  <ScoreBarWithHover
                    score={item.totalScore}
                    maxScore={maxScore}
                    tweets={item.tweets}
                    author={{ username: item.username, avatarUrl: item.avatarUrl }}
                  />

                  {/* Mindshare */}
                  <div className="text-right text-sm text-cyan-400 font-mono">
                    {item.mindsharePercent}%
                  </div>

                  {/* Daily Reward */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-green-400">
                      {item.dailyReward.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">LVMON</span>
                  </div>

                  {/* Total Reward */}
                  <div className="text-right">
                    <span className="text-sm font-mono text-gray-300">
                      {item.totalReward.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">LVMON</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-400">
                  {page} / {data.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                  disabled={page === data.pagination.totalPages}
                  className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-50"
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
