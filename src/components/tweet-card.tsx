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
    <div className="bg-surface-card border border-border rounded-2xl p-5 hover:border-border-strong transition-colors">
      <div className="flex items-start gap-3">
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-surface-secondary" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/creators/${author.username}`}
              className="font-semibold text-sm text-text-primary hover:text-brand transition-colors"
            >
              {author.name}
            </Link>
            <span className="text-xs text-text-tertiary">@{author.username}</span>
            <span className="text-xs text-text-tertiary">
              {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>

          <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
            {text}
          </p>

          {metrics && (
            <div className="flex items-center gap-4 mt-3 text-xs text-text-tertiary">
              <span>{metrics.likes} likes</span>
              <span>{metrics.replies} replies</span>
              <span>{metrics.retweets} RTs</span>
              <span>{metrics.quotes} quotes</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            {score && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 bg-brand/10 text-brand rounded-lg font-medium">
                  Quality: {score.quality.toFixed(1)}
                </span>
                {score.engagementPending ? (
                  <span className="px-2.5 py-1 bg-accent-yellow/10 text-accent-yellow rounded-lg flex items-center gap-1.5 font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
                    Engagement: Calculating...
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-accent-cyan/10 text-accent-cyan rounded-lg font-medium">
                    Engagement: {score.engagement?.toFixed(1) ?? "-"}
                  </span>
                )}
                <span className="px-2.5 py-1 bg-accent-green/10 text-accent-green rounded-lg font-medium">
                  Score: {score.final?.toFixed(1) ?? "-"}
                  {score.engagementPending && <span className="text-text-tertiary ml-0.5">*</span>}
                </span>
              </div>
            )}
            <a
              href={`https://x.com/${author.username}/status/${tweetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-tertiary hover:text-brand transition-colors"
            >
              View on X
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
