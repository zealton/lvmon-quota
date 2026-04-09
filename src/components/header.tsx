"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";

export function Header() {
  const { data: session, status } = useSession();
  const role = (session as Record<string, any> | null)?.role;

  return (
    <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                LVMON
              </span>
              <span className="text-sm text-gray-400">Quota Campaign</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              <Link
                href="/tweets"
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                Leaderboard
              </Link>
              {role === "admin" && (
                <Link
                  href="/admin"
                  className="text-sm text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {status === "loading" ? (
              <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
            ) : session ? (
              <div className="flex items-center gap-3">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <span className="text-sm text-gray-300">
                  {session.user?.name}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn("twitter")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Login with X
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
