"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

function WalletButton() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/viewer/summary")
      .then((r) => r.json())
      .then((d) => { if (d.walletAddress) setWallet(d.walletAddress); })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!input.trim()) return;
    setSaving(true);
    const res = await fetch("/api/viewer/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: input.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      setWallet(data.walletAddress);
      setEditing(false);
    }
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="0x... or wallet address"
          autoFocus
          className="w-48 bg-surface-elevated border border-border rounded-xl px-2.5 py-1 text-xs focus:border-brand focus:outline-none"
        />
        <button onClick={save} disabled={saving} className="text-xs text-brand hover:text-brand-hover font-medium transition-colors">
          {saving ? "..." : "Save"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-text-tertiary hover:text-text-secondary transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  if (wallet) {
    return (
      <button
        onClick={() => { setInput(wallet); setEditing(true); }}
        className="px-3 py-1 bg-surface-secondary hover:bg-surface-elevated rounded-xl text-xs font-mono text-text-secondary transition-colors"
        title={wallet}
      >
        {wallet.slice(0, 6)}...{wallet.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-elevated border border-border rounded-xl text-xs font-medium text-text-secondary transition-colors"
    >
      Connect Wallet
    </button>
  );
}

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-border bg-surface-dark/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="text-xl font-bold text-brand">LVMON</span>
              <span className="text-sm text-text-tertiary">Quota</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/tweets"
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Leaderboard
              </Link>
              <Link
                href="/admin"
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Admin
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {status === "loading" ? (
              <div className="w-8 h-8 rounded-full bg-surface-secondary animate-pulse" />
            ) : session ? (
              <div className="flex items-center gap-3">
                <WalletButton />
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <span className="text-sm text-text-secondary">
                  {session.user?.name}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn("twitter")}
                className="px-5 py-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold rounded-[56px] transition-colors"
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
