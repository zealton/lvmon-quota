import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 100);
  const status = req.nextUrl.searchParams.get("status") || undefined;

  const where = status ? { status: status as "active" | "banned" } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        socialAccounts: {
          where: { provider: "x" },
          select: {
            username: true,
            name: true,
            avatarUrl: true,
            followersCount: true,
            followingCount: true,
            tweetCount: true,
            accountCreatedAt: true,
            verified: true,
          },
          take: 1,
        },
        _count: {
          select: { tweets: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    items: users.map((u) => ({
      id: u.id,
      status: u.status,
      role: u.role,
      displayName: u.displayName,
      createdAt: u.createdAt,
      social: u.socialAccounts[0] || null,
      tweetCount: u._count.tweets,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
