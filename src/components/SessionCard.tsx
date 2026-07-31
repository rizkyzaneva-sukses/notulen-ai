"use client";

import Link from "next/link";
import {
  CATEGORY_LABELS,
  SOURCE_LABELS,
  formatDate,
  formatDuration,
} from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { Clock, Tag } from "lucide-react";

export interface SessionListItem {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  category: string | null;
  durationSeconds: number | null;
  createdAt: string;
  summary?: { executiveSummary: string } | null;
  _count?: { actionItems: number };
}

export function SessionCard({ session }: { session: SessionListItem }) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="card block p-4 transition hover:border-accent/40 active:scale-[0.99]"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-100">
          {session.title}
        </h3>
        <StatusBadge status={session.status} />
      </div>
      {session.summary?.executiveSummary && (
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {session.summary.executiveSummary}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>{SOURCE_LABELS[session.sourceType] || session.sourceType}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(session.durationSeconds)}
        </span>
        <span>·</span>
        <span>{formatDate(session.createdAt)}</span>
        {session.category && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-accent-soft">
              <Tag className="h-3 w-3" />
              {CATEGORY_LABELS[session.category] || session.category}
            </span>
          </>
        )}
        {(session._count?.actionItems ?? 0) > 0 && (
          <>
            <span>·</span>
            <span>{session._count!.actionItems} tugas</span>
          </>
        )}
      </div>
    </Link>
  );
}
