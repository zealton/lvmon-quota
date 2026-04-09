import Link from "next/link";

interface TweetCardProps {
  tweetId: string;
  text: string;
  createdAt: string;
  hasMedia: boolean;
  author: {
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  score: {
    quality: number;
    engagement: number;
    final: number;
  } | null;
  metrics: {
    likes: number;
    replies: number;
    retweets: number;
    quotes: number;
  } | null;
}

export function TweetCard({ tweetId, text, createdAt, author, score, metrics }: TweetCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-3">
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-700" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/creators/${author.username}`}
              className="font-medium text-sm hover:underline"
            >
              {author.name}
            </Link>
            <span className="text-xs text-gray-500">@{author.username}</span>
            <span className="text-xs text-gray-600">
              {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>

          <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap break-words">
            {text}
          </p>

          {metrics && (
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span>{metrics.likes} likes</span>
              <span>{metrics.replies} replies</span>
              <span>{metrics.retweets} RTs</span>
              <span>{metrics.quotes} quotes</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
            {score && (
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded">
                  Quality: {score.quality.toFixed(1)}
                </span>
                <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded">
                  Engagement: {score.engagement.toFixed(1)}
                </span>
                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded font-medium">
                  Score: {score.final.toFixed(1)}
                </span>
              </div>
            )}
            <a
              href={`https://x.com/${author.username}/status/${tweetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
            >
              View on X →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
