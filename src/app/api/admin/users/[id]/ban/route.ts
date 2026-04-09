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
  const { ban, reason } = body;

  await prisma.user.update({
    where: { id },
    data: { status: ban ? "banned" : "active" },
  });

  await prisma.moderationAction.create({
    data: {
      targetType: "user",
      targetId: id,
      actionType: ban ? "ban" : "unban",
      reason: reason || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdBy: (session as any).userId || "admin",
    },
  });

  return NextResponse.json({ success: true });
}
