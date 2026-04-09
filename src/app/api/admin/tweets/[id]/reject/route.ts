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
  const { reason } = body;

  await prisma.tweet.update({
    where: { id },
    data: { status: "rejected" },
  });

  if (await prisma.tweetScore.findUnique({ where: { tweetId: id } })) {
    await prisma.tweetScore.update({
      where: { tweetId: id },
      data: { isPublic: false },
    });
  }

  await prisma.moderationAction.create({
    data: {
      targetType: "tweet",
      targetId: id,
      actionType: "reject",
      reason: reason || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdBy: (session as any).userId || "admin",
    },
  });

  return NextResponse.json({ success: true });
}
