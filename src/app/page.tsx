"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SessionCard, type SessionListItem } from "@/components/SessionCard";
import { PushEnable } from "@/components/PushEnable";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/utils";
import { Plus, Search } from "lucide-react";

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (category) params.set("category", category);
      const res = await fetch(`/api/sessions?${params}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } finally {
      setLoading(false);
    }
  }, [q, category]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // poll if any in-progress
  useEffect(() => {
    const busy = sessions.some((s) =>
      ["QUEUED", "TRANSCRIBING", "TRANSCRIBED", "SUMMARIZING"].includes(s.status)
    );
    if (!busy) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [sessions, load]);

  return (
    <AppShell
      title="Riwayat Sesi"
      action={
        <div className="flex items-center gap-1">
          <PushEnable />
          <Link href="/new" className="btn-primary !px-3 !py-2 text-xs">
            <Plus className="h-4 w-4" />
            Baru
          </Link>
        </div>
      }
    >
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-10"
            placeholder="Cari di transkrip & resume..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={`badge shrink-0 px-3 py-1 ${
              !category
                ? "bg-accent text-white"
                : "bg-navy-800 text-slate-400"
            }`}
          >
            Semua
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c === category ? "" : c)}
              className={`badge shrink-0 px-3 py-1 ${
                category === c
                  ? "bg-accent text-white"
                  : "bg-navy-800 text-slate-400"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">Memuat...</p>
      ) : sessions.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-slate-400">Belum ada sesi</p>
          <Link href="/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            Tambah Sesi Baru
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
