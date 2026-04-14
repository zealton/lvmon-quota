"use client";

import { Header } from "@/components/header";
import { AdminTabs } from "@/components/admin-tabs";
import { useEffect, useState } from "react";

interface AdminUser {
  id: string;
  status: string;
  role: string;
  displayName: string | null;
  createdAt: string;
  social: {
    username: string;
    name: string;
    avatarUrl: string | null;
    followersCount: number;
    accountCreatedAt: string | null;
  } | null;
  tweetCount: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = () => {
    fetch(`/api/admin/users?page=${page}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
      });
  };

  useEffect(() => { fetchUsers(); }, [page]);

  const toggleBan = async (id: string, currentStatus: string) => {
    const ban = currentStatus !== "banned";
    const reason = ban ? prompt("Ban reason:") : "unbanned";
    if (reason === null) return;
    await fetch(`/api/admin/users/${id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ban, reason }),
    });
    fetchUsers();
  };

  const setTrust = async (id: string) => {
    const val = prompt("Trust multiplier (0, 0.5, 0.75, 1.0):");
    if (!val) return;
    const reason = prompt("Reason:");
    await fetch(`/api/admin/users/${id}/trust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trustMultiplier: parseFloat(val), reason }),
    });
    alert("Updated");
  };

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AdminTabs />
        <h1 className="text-2xl font-bold mb-6">User Management</h1>

        <div className="bg-surface-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-tertiary border-b border-border">
                <th className="text-left py-3 px-4">User</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Followers</th>
                <th className="text-right py-3 px-4">Tweets</th>
                <th className="text-right py-3 px-4">Joined</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-surface-elevated/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {u.social?.avatarUrl && (
                        <img src={u.social.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      <div>
                        <div className="font-medium">{u.social?.name || u.displayName}</div>
                        <div className="text-xs text-text-tertiary">@{u.social?.username || "?"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                      u.status === "banned" ? "bg-accent-red/10 text-accent-red" : "bg-accent-green/10 text-accent-green"
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{u.social?.followersCount?.toLocaleString() || 0}</td>
                  <td className="py-3 px-4 text-right font-mono">{u.tweetCount}</td>
                  <td className="py-3 px-4 text-right text-text-tertiary text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right space-x-3">
                    <button
                      onClick={() => toggleBan(u.id, u.status)}
                      className={`text-xs font-medium transition-colors ${u.status === "banned" ? "text-accent-green hover:text-accent-green/80" : "text-accent-red hover:text-accent-red/80"}`}
                    >
                      {u.status === "banned" ? "Unban" : "Ban"}
                    </button>
                    <button onClick={() => setTrust(u.id)} className="text-xs text-accent-yellow hover:text-accent-yellow/80 font-medium transition-colors">
                      Trust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] disabled:opacity-50 transition-colors">Prev</button>
            <span className="text-sm text-text-tertiary">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-4 py-1.5 text-sm bg-surface-secondary hover:bg-surface-elevated rounded-[56px] disabled:opacity-50 transition-colors">Next</button>
          </div>
        )}
      </main>
    </>
  );
}
