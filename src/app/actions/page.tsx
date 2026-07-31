"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CATEGORY_LABELS, cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface ActionItemRow {
  id: string;
  description: string;
  owner: string | null;
  dueDate: string | null;
  isDone: boolean;
  session: { id: string; title: string; category: string | null };
}

export default function ActionsPage() {
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/action-items");
      const data = await res.json();
      setItems(data.actionItems || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(id: string, isDone: boolean) {
    await fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDone }),
    });
    load();
  }

  const filtered = items.filter((i) => (showDone ? true : !i.isDone));

  return (
    <AppShell title="Action Items">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">Lintas semua sesi</p>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="rounded"
          />
          Tampilkan selesai
        </label>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Memuat...</p>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-500">
          Tidak ada action item
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <li key={a.id} className="card flex items-start gap-3 p-3">
              <button
                type="button"
                onClick={() => toggle(a.id, !a.isDone)}
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  a.isDone
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-surface-border"
                )}
              >
                {a.isDone && <Check className="h-3 w-3" />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm text-slate-200",
                    a.isDone && "text-slate-500 line-through"
                  )}
                >
                  {a.description}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  <Link
                    href={`/sessions/${a.session.id}`}
                    className="text-accent-soft hover:underline"
                  >
                    {a.session.title}
                  </Link>
                  {a.session.category &&
                    ` · ${CATEGORY_LABELS[a.session.category] || a.session.category}`}
                  {a.owner && ` · ${a.owner}`}
                  {a.dueDate && ` · ${String(a.dueDate).slice(0, 10)}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
