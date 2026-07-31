"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Home, LogOut, Mic, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/new", label: "Tambah", icon: Plus },
  { href: "/actions", label: "Tugas", icon: CheckSquare },
];

export function AppShell({
  children,
  title,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-navy-950">
      <header className="safe-pt sticky top-0 z-20 border-b border-surface-border/80 bg-navy-950/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent-soft">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">
                Notulen AI
              </p>
              <h1 className="text-sm font-semibold text-slate-100">
                {title || "Riwayat"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {action}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-2 text-slate-400 hover:bg-navy-800 hover:text-slate-200"
              aria-label="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 safe-pb">{children}</main>

      <nav className="safe-pb sticky bottom-0 z-20 border-t border-surface-border bg-navy-900/95 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 px-2 py-2">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px]",
                  active
                    ? "bg-accent/15 text-accent-soft"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
