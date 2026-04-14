"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/epoch", label: "Epoch" },
  { href: "/admin/score-logs", label: "Score Logs" },
  { href: "/admin/tweets", label: "Tweets" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/config", label: "Config" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-border mb-6">
      {TABS.map((tab) => {
        const isActive = tab.href === "/admin"
          ? pathname === "/admin"
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              isActive
                ? "text-brand"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
