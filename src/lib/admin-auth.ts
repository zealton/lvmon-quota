import { auth } from "./auth";
import { NextResponse } from "next/server";

// Admin usernames whitelist — these users are auto-promoted to admin on login
export const ADMIN_USERNAMES = ["auuutoo", "Alex_LeverUp"];

export async function requireAdmin() {
  const session = await auth();

  if (!session) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }), session: null };
  }

  const role = (session as any).role;
  const username = (session as any).username;

  // Allow if role is admin OR username is in whitelist
  if (role === "admin" || ADMIN_USERNAMES.includes(username)) {
    return { error: null, session };
  }

  return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
}
