import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { trustMultiplier, reason } = body;

  // Update all tweet scores for this user that haven't been settled
  const tweets = await prisma.tweet.findMany({
    where: { userId: id, status: "scored" },
    include: { score: true },
  });

  for (const tweet of tweets) {
    if (tweet.score) {
      const newFinal = trustMultiplier * (tweet.score.qualityScore + tweet.score.engagementScore);
      await prisma.tweetScore.update({
        where: { id: tweet.score.id },
        data: { trustMultiplier, finalScore: Math.min(100, newFinal) },
      });
    }
  }

  await prisma.moderationAction.create({
    data: {
      targetType: "user",
      targetId: id,
      actionType: "set_trust",
      reason: `trust=${trustMultiplier}. ${reason || ""}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdBy: (session as any).userId || "admin",
    },
  });

  return NextResponse.json({ success: true, updatedTweets: tweets.length });
}
