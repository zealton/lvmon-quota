import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = (session as any).userId as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }

  const { walletAddress } = await req.json();

  // Disconnect: empty string clears wallet
  if (walletAddress === "" || walletAddress === null) {
    await prisma.user.update({
      where: { id: userId },
      data: { walletAddress: null },
    });
    return NextResponse.json({ success: true, walletAddress: null });
  }

  if (typeof walletAddress !== "string") {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const trimmed = walletAddress.trim();
  if (trimmed.length < 32 || trimmed.length > 64) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { walletAddress: trimmed },
  });

  return NextResponse.json({ success: true, walletAddress: trimmed });
}
