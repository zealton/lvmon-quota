-- AlterTable
ALTER TABLE "tweets" ADD COLUMN     "author_followers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "author_verified" BOOLEAN NOT NULL DEFAULT false;
