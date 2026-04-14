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
    engagement: number | null;
    final: number | null;
    engagementPending?: boolean;
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
    <div className="bg-surface-1 border border-border rounded-md p-4 hover:border-border-strong transition-colors">
      <div className="flex items-start gap-3">
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className="w-8 h-8 rounded" />
        ) : (
          <div className="w-8 h-8 rounded bg-surface-3" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/creators/${author.username}`}
              className="font-medium text-sm text-text-primary hover:text-accent-long transition-colors"
            >
              {author.name}
            </Link>
            <span className="text-[11px] text-text-subtle">@{author.username}</span>
            <span className="text-[11px] text-text-faint">
              {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-text-secondary leading-relaxed break-words">
            {text}
          </p>

          {metrics && (
            <div className="flex items-center gap-4 mt-2 text-[11px] text-text-subtle">
              <span>{metrics.likes} likes</span>
              <span>{metrics.replies} replies</span>
              <span>{metrics.retweets} RTs</span>
              <span>{metrics.quotes} quotes</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            {score && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 bg-info/10 text-info rounded font-medium" title="AI content quality rating">
                  Content {score.quality.toFixed(1)}
                </span>
                {score.engagementPending ? (
                  <span className="px-2 py-0.5 bg-warning/10 text-warning rounded flex items-center gap-1 font-medium" title="Engagement data pending">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    Engage --
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-accent-long-bg text-accent-long rounded font-medium" title="Engagement score">
                    Engage {score.engagement?.toFixed(1) ?? "-"}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-accent-long-bg text-accent-long-strong rounded font-medium" title="Final score">
                  Score {score.final?.toFixed(1) ?? "-"}
                  {score.engagementPending && <span className="text-text-faint ml-0.5">*</span>}
                </span>
              </div>
            )}
            <a
              href={`https://x.com/${author.username}/status/${tweetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-text-faint hover:text-info transition-colors"
            >
              View on X
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
