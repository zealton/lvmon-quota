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
          className="w-48 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs focus:border-accent-long focus:outline-none transition-colors"
        />
        <button onClick={save} disabled={saving} className="text-xs text-accent-long hover:text-accent-long-strong font-medium transition-colors">
          {saving ? "..." : "Save"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-text-subtle hover:text-text-muted transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  if (wallet) {
    return (
      <button
        onClick={() => { setInput(wallet); setEditing(true); }}
        className="px-2.5 py-1 bg-surface-2 hover:bg-surface-hover border border-border rounded text-xs font-mono text-text-muted transition-colors"
        title={wallet}
      >
        {wallet.slice(0, 6)}...{wallet.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-2.5 py-1 bg-surface-2 hover:bg-surface-hover border border-border rounded text-xs font-medium text-text-muted transition-colors"
    >
      Connect Wallet
    </button>
  );
}

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-border bg-bg-panel sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold text-accent-long font-display">LVMON</span>
              <span className="text-xs text-text-subtle">Quota</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              <Link href="/tweets" className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors">
                Leaderboard
              </Link>
              <Link href="/admin" className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors">
                Admin
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {status === "loading" ? (
              <div className="w-6 h-6 rounded bg-surface-2 animate-pulse" />
            ) : session ? (
              <div className="flex items-center gap-2">
                <WalletButton />
                {session.user?.image && (
                  <img src={session.user.image} alt="" className="w-6 h-6 rounded" />
                )}
                <span className="text-xs text-text-muted">{session.user?.name}</span>
                <button
                  onClick={() => signOut()}
                  className="text-[11px] text-text-faint hover:text-text-muted transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn("twitter")}
                className="px-4 py-1.5 bg-accent-long hover:bg-accent-long-strong text-bg-canvas text-xs font-semibold rounded transition-colors"
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
