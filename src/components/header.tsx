"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

function WalletButton() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetch("/api/viewer/summary")
      .then((r) => r.json())
      .then((d) => { if (d.walletAddress) setWallet(d.walletAddress); })
      .catch(() => {});
  }, []);

  const connect = async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    setConnecting(true);
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts[0] as string;

      // Sign message to verify ownership
      const message = `Connect wallet to LVMON Quota\nAddress: ${address}\nTimestamp: ${Date.now()}`;
      await eth.request({ method: "personal_sign", params: [message, address] });

      // Save to backend
      const res = await fetch("/api/viewer/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (data.success) {
        setWallet(data.walletAddress);
        window.dispatchEvent(new CustomEvent("wallet-changed", { detail: data.walletAddress }));
      }
    } catch (err) {
      console.error("Wallet connect error:", err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await fetch("/api/viewer/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: "" }),
    });
    setWallet(null);
    window.dispatchEvent(new CustomEvent("wallet-changed", { detail: null }));
  };

  if (wallet) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => { navigator.clipboard.writeText(wallet); }}
          className="px-2.5 py-1 bg-surface-2 hover:bg-surface-hover border border-border rounded-l text-xs font-mono text-text-muted transition-colors"
          title={`${wallet} — click to copy`}
        >
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </button>
        <button
          onClick={disconnect}
          className="px-1.5 py-1 bg-surface-2 hover:bg-accent-short/20 border border-border border-l-0 rounded-r text-xs text-text-faint hover:text-accent-short transition-colors"
          title="Disconnect wallet"
        >
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="px-2.5 py-1 bg-surface-2 hover:bg-surface-hover border border-border rounded text-xs font-medium text-text-muted transition-colors disabled:opacity-50"
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}

const ADMIN_USERNAMES = ["auuutoo", "Alex_LeverUp", "rona_leverup"];

export function Header() {
  const { data: session, status } = useSession();
  const role = (session as Record<string, any> | null)?.role;
  const username = (session as Record<string, any> | null)?.username;
  const isAdmin = role === "admin" || ADMIN_USERNAMES.includes(username);

  return (
    <header className="border-b border-border bg-bg-panel sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <img src="/icon.png" alt="" className="w-5 h-5" />
              <span className="text-lg font-bold text-accent-long font-display">LVMON</span>
              <span className="text-xs text-text-subtle">Quota</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              <Link href="/tweets" className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors">
                Leaderboard
              </Link>
              {isAdmin && (
                <Link href="/admin" className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors">
                  Admin
                </Link>
              )}
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
