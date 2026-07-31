"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { MindMapView, MindMapBullet, type MindMapNodeData } from "@/components/MindMapView";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SOURCE_LABELS,
  formatDate,
  formatDuration,
  cn,
} from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

interface SessionDetail {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  status: string;
  category: string | null;
  errorMessage: string | null;
  createdAt: string;
  transcript: {
    rawText: string;
    segments: Array<{
      text: string;
      start: number;
      end: number;
      speaker?: string;
      confidence?: number;
    }>;
    language: string | null;
    confidenceAvg: number | null;
  } | null;
  summary: {
    executiveSummary: string;
    keyPoints: string[];
    decisions: string[];
    llmModel: string;
  } | null;
  actionItems: Array<{
    id: string;
    description: string;
    owner: string | null;
    dueDate: string | null;
    isDone: boolean;
  }>;
  mindMap: { structure: MindMapNodeData } | null;
  speakers: Array<{ id: string; speakerCode: string; displayName: string }>;
}

type Tab = "resume" | "transkrip" | "mindmap";

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [tab, setTab] = useState<Tab>("resume");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerName, setSpeakerName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${id}`);
    if (res.status === 404) {
      setSession(null);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setSession(data.session);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session) return;
    const busyStatus = ["QUEUED", "TRANSCRIBING", "TRANSCRIBED", "SUMMARIZING"].includes(
      session.status
    );
    if (!busyStatus) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [session, load]);

  async function updateCategory(category: string) {
    if (!session) return;
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: category || null }),
    });
    load();
  }

  async function toggleAction(itemId: string, isDone: boolean) {
    await fetch(`/api/action-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDone }),
    });
    load();
  }

  async function regenerate() {
    setBusy(true);
    try {
      await fetch(`/api/sessions/${id}/regenerate`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Hapus sesi ini?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    router.replace("/");
  }

  async function saveSpeaker(speakerId: string) {
    await fetch(`/api/sessions/${id}/speakers`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ speakerId, displayName: speakerName }),
    });
    setEditingSpeaker(null);
    load();
  }

  function buildMarkdown(): string {
    if (!session) return "";
    const kp = (session.summary?.keyPoints as string[]) || [];
    const dec = (session.summary?.decisions as string[]) || [];
    const lines = [
      `# ${session.title}`,
      "",
      `> ${formatDate(session.createdAt)} · ${SOURCE_LABELS[session.sourceType] || session.sourceType}`,
      "",
      "## Executive Summary",
      session.summary?.executiveSummary || "—",
      "",
      "## Poin Penting",
      ...kp.map((p) => `- ${p}`),
      "",
      "## Keputusan",
      ...(dec.length ? dec.map((p) => `- ${p}`) : ["- Tidak ada"]),
      "",
      "## Action Items",
      ...session.actionItems.map(
        (a) =>
          `- [${a.isDone ? "x" : " "}] ${a.description}${a.owner ? ` (@${a.owner})` : ""}`
      ),
    ];
    return lines.join("\n");
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(buildMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function speakerLabel(code?: string) {
    if (!code || !session) return "";
    const s = session.speakers.find((x) => x.speakerCode === code);
    return s?.displayName || code;
  }

  if (loading) {
    return (
      <AppShell title="Sesi">
        <p className="py-12 text-center text-sm text-slate-500">Memuat...</p>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell title="Sesi">
        <p className="text-sm text-slate-400">Sesi tidak ditemukan</p>
        <Link href="/" className="btn-ghost mt-4">
          Kembali
        </Link>
      </AppShell>
    );
  }

  const processing = ["QUEUED", "TRANSCRIBING", "TRANSCRIBED", "SUMMARIZING"].includes(
    session.status
  );

  return (
    <AppShell
      title="Detail Sesi"
      action={
        <Link href="/" className="rounded-lg p-2 text-slate-400 hover:bg-navy-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      }
    >
      <div className="mb-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100">{session.title}</h2>
          <StatusBadge status={session.status} />
        </div>
        <p className="text-[11px] text-slate-500">
          {SOURCE_LABELS[session.sourceType]} · {formatDuration(session.durationSeconds)} ·{" "}
          {formatDate(session.createdAt)}
        </p>

        {processing && (
          <div className="card flex items-center gap-3 p-3 text-sm text-amber-200">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span>
              Sedang diproses di background (
              {session.status === "QUEUED"
                ? "antrian"
                : session.status === "TRANSCRIBING"
                  ? "transkripsi"
                  : session.status === "SUMMARIZING"
                    ? "ringkasan"
                    : "lanjut..."}
              )...
            </span>
          </div>
        )}

        {session.errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {session.errorMessage}
          </div>
        )}

        <div>
          <label className="label">5 Mahkota</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => updateCategory("")}
              className={cn(
                "badge px-2.5 py-1",
                !session.category ? "bg-accent text-white" : "bg-navy-800 text-slate-400"
              )}
            >
              —
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateCategory(c)}
                className={cn(
                  "badge px-2.5 py-1",
                  session.category === c
                    ? "bg-accent text-white"
                    : "bg-navy-800 text-slate-400"
                )}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost !py-2 text-xs" onClick={copyMarkdown}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Tersalin" : "Copy MD"}
          </button>
          <a
            href={`/api/export/${session.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !py-2 text-xs"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </a>
          {session.audioUrl && (
            <a href={session.audioUrl} className="btn-ghost !py-2 text-xs">
              <Download className="h-3.5 w-3.5" />
              Audio
            </a>
          )}
          {session.transcript && (
            <button
              type="button"
              className="btn-ghost !py-2 text-xs"
              onClick={regenerate}
              disabled={busy}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              Generate Ulang
            </button>
          )}
          <button type="button" className="btn-danger !py-2 text-xs" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
            Hapus
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-navy-900 p-1">
        {(
          [
            ["resume", "Resume"],
            ["transkrip", "Transkrip"],
            ["mindmap", "Mind Map"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg py-2 text-xs",
              tab === id ? "bg-accent text-white" : "text-slate-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "resume" && (
        <div className="space-y-4">
          {!session.summary ? (
            <p className="text-sm text-slate-500">
              {processing ? "Resume sedang digenerate..." : "Resume belum tersedia"}
            </p>
          ) : (
            <>
              <section className="card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Executive Summary
                </h3>
                <p className="text-sm leading-relaxed text-slate-200">
                  {session.summary.executiveSummary}
                </p>
              </section>
              <section className="card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Poin Penting
                </h3>
                <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-200">
                  {((session.summary.keyPoints as string[]) || []).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </section>
              <section className="card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Keputusan
                </h3>
                {((session.summary.decisions as string[]) || []).length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada keputusan tercatat</p>
                ) : (
                  <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-200">
                    {((session.summary.decisions as string[]) || []).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Action Items
                </h3>
                {session.actionItems.length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada action item</p>
                ) : (
                  <ul className="space-y-2">
                    {session.actionItems.map((a) => (
                      <li key={a.id} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAction(a.id, !a.isDone)}
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            a.isDone
                              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                              : "border-surface-border"
                          )}
                        >
                          {a.isDone && <Check className="h-3 w-3" />}
                        </button>
                        <div className="text-sm">
                          <p
                            className={cn(
                              "text-slate-200",
                              a.isDone && "text-slate-500 line-through"
                            )}
                          >
                            {a.description}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {a.owner && <span>{a.owner}</span>}
                            {a.owner && a.dueDate && " · "}
                            {a.dueDate && (
                              <span>{String(a.dueDate).slice(0, 10)}</span>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {tab === "transkrip" && (
        <div className="space-y-3">
          {session.speakers.length > 0 && (
            <div className="card space-y-2 p-3">
              <p className="text-xs text-slate-400">Rename speaker</p>
              {session.speakers.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  {editingSpeaker === s.id ? (
                    <>
                      <input
                        className="input !py-1.5 text-xs"
                        value={speakerName}
                        onChange={(e) => setSpeakerName(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary !px-2 !py-1.5 text-xs"
                        onClick={() => saveSpeaker(s.id)}
                      >
                        Simpan
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-xs text-slate-300">
                        {s.speakerCode} → <strong>{s.displayName}</strong>
                      </span>
                      <button
                        type="button"
                        className="text-[11px] text-accent-soft"
                        onClick={() => {
                          setEditingSpeaker(s.id);
                          setSpeakerName(s.displayName);
                        }}
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {!session.transcript ? (
            <p className="text-sm text-slate-500">Transkrip belum tersedia</p>
          ) : session.transcript.segments?.length ? (
            <div className="space-y-2">
              {session.transcript.segments.map((seg, i) => (
                <div
                  key={i}
                  className={cn(
                    "card p-3",
                    typeof seg.confidence === "number" &&
                      seg.confidence < 0.5 &&
                      "border-amber-500/40"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-medium text-accent-soft">
                      {speakerLabel(seg.speaker)}
                    </span>
                    <span>
                      {formatDuration(Math.floor(seg.start))}
                      {typeof seg.confidence === "number" && seg.confidence < 0.5
                        ? " · low conf"
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200">{seg.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {session.transcript.rawText}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "mindmap" && (
        <div className="space-y-3">
          {session.mindMap?.structure ? (
            <>
              <MindMapView structure={session.mindMap.structure} height={440} />
              <div className="card p-4">
                <p className="mb-2 text-xs text-slate-500">Fallback bullet tree</p>
                <MindMapBullet node={session.mindMap.structure} />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Mind map belum tersedia</p>
          )}
        </div>
      )}
    </AppShell>
  );
}
