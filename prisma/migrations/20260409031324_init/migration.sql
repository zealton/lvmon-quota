-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'banned');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "TweetStatus" AS ENUM ('captured', 'eligible', 'ready_to_score', 'scored', 'rejected', 'settled');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('capture', 'scoring');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('open', 'settled', 'empty');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('issue', 'consume', 'expire', 'admin_adjust');

-- CreateEnum
CREATE TYPE "ModerationTargetType" AS ENUM ('user', 'tweet');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "display_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'x',
    "provider_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "account_created_at" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "followers_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "tweet_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tweets" (
    "id" TEXT NOT NULL,
    "tweet_id" TEXT NOT NULL,
    "user_id" TEXT,
    "author_x_user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lang" TEXT,
    "conversation_id" TEXT,
    "created_at_x" TIMESTAMP(3) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TweetStatus" NOT NULL DEFAULT 'captured',
    "has_media" BOOLEAN NOT NULL DEFAULT false,
    "is_quote" BOOLEAN NOT NULL DEFAULT false,
    "is_reply" BOOLEAN NOT NULL DEFAULT false,
    "is_retweet" BOOLEAN NOT NULL DEFAULT false,
    "query_source" TEXT,

    CONSTRAINT "tweets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tweet_metric_snapshots" (
    "id" TEXT NOT NULL,
    "tweet_id" TEXT NOT NULL,
    "snapshot_type" "SnapshotType" NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "retweet_count" INTEGER NOT NULL DEFAULT 0,
    "quote_count" INTEGER NOT NULL DEFAULT 0,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tweet_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tweet_scores" (
    "id" TEXT NOT NULL,
    "tweet_id" TEXT NOT NULL,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagement_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trust_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "final_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'none',
    "risk_reasons" JSONB,
    "similarity_hash" TEXT,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoring_version" TEXT NOT NULL DEFAULT 'v1',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "relevance_subscore" DOUBLE PRECISION,
    "originality_subscore" DOUBLE PRECISION,
    "format_subscore" DOUBLE PRECISION,

    CONSTRAINT "tweet_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_daily_scores" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score_date" DATE NOT NULL,
    "tweet_count_eligible" INTEGER NOT NULL DEFAULT 0,
    "tweet_ids" JSONB,
    "score_1" DOUBLE PRECISION,
    "score_2" DOUBLE PRECISION,
    "score_3" DOUBLE PRECISION,
    "final_user_score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "user_daily_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_quota_pools" (
    "id" TEXT NOT NULL,
    "pool_date" DATE NOT NULL,
    "quota_amount" DOUBLE PRECISION NOT NULL,
    "total_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PoolStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "daily_quota_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_issuances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pool_date" DATE NOT NULL,
    "issuance_week_start" DATE NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "quota_amount" DOUBLE PRECISION NOT NULL,
    "source_user_score" DOUBLE PRECISION NOT NULL,
    "source_total_score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "quota_issuances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balance_after" DOUBLE PRECISION NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_daily_stats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stat_date" DATE NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "index_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mindshare_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_reward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_reward_delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_reward" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "creator_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "target_type" "ModerationTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_provider_provider_user_id_key" ON "social_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tweets_tweet_id_key" ON "tweets"("tweet_id");

-- CreateIndex
CREATE UNIQUE INDEX "tweet_scores_tweet_id_key" ON "tweet_scores"("tweet_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_daily_scores_user_id_score_date_key" ON "user_daily_scores"("user_id", "score_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_quota_pools_pool_date_key" ON "daily_quota_pools"("pool_date");

-- CreateIndex
CREATE UNIQUE INDEX "quota_issuances_user_id_pool_date_key" ON "quota_issuances"("user_id", "pool_date");

-- CreateIndex
CREATE UNIQUE INDEX "creator_daily_stats_user_id_stat_date_key" ON "creator_daily_stats"("user_id", "stat_date");

-- CreateIndex
CREATE UNIQUE INDEX "app_config_key_key" ON "app_config"("key");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tweets" ADD CONSTRAINT "tweets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tweet_metric_snapshots" ADD CONSTRAINT "tweet_metric_snapshots_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "tweets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tweet_scores" ADD CONSTRAINT "tweet_scores_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "tweets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_daily_scores" ADD CONSTRAINT "user_daily_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_issuances" ADD CONSTRAINT "quota_issuances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_daily_stats" ADD CONSTRAINT "creator_daily_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
