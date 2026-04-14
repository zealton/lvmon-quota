-- CreateTable
CREATE TABLE "score_logs" (
    "id" TEXT NOT NULL,
    "tweet_id" TEXT NOT NULL,
    "author_username" TEXT,
    "log_type" TEXT NOT NULL,
    "quality_score" DOUBLE PRECISION NOT NULL,
    "engagement_prev" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagement_new" DOUBLE PRECISION NOT NULL,
    "final_prev" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final_new" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trust_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_logs_pkey" PRIMARY KEY ("id")
);
