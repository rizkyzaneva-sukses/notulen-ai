"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  FileAudio,
  Link2,
  Loader2,
  Upload,
  Video,
  Users,
} from "lucide-react";
import { cn, detectSourceFromUrl, isValidUrl } from "@/lib/utils";

type Tab = "upload" | "youtube" | "loom" | "meeting";

export default function NewSessionPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("upload");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Pilih file audio/video");
      return;
    }
    setLoading(true);
    setError("");
    setProgress("Mengunggah...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title) fd.append("title", title);
      const res = await fetch("/api/sessions", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload");
      router.replace(`/sessions/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  async function submitLink(e: FormEvent) {
    e.preventDefault();
    if (!isValidUrl(url)) {
      setError("URL tidak valid");
      return;
    }
    const detected = detectSourceFromUrl(url);
    if (tab === "youtube" && detected !== "YOUTUBE") {
      setError("Masukkan link YouTube yang valid");
      return;
    }
    if (tab === "loom" && detected !== "LOOM") {
      setError("Masukkan link Loom yang valid");
      return;
    }
    if (tab === "meeting" && detected !== "MEETING_BOT") {
      setError("Masukkan link Zoom / Google Meet / Teams");
      return;
    }

    setLoading(true);
    setError("");
    setProgress("Membuat sesi...");
    try {
      const sourceType =
        tab === "youtube"
          ? "YOUTUBE"
          : tab === "loom"
            ? "LOOM"
            : tab === "meeting"
              ? "MEETING_BOT"
              : detected;

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, title: title || undefined, sourceType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat sesi");
      router.replace(`/sessions/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Upload }[] = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "youtube", label: "YouTube", icon: Video },
    { id: "loom", label: "Loom", icon: Link2 },
    { id: "meeting", label: "Meeting", icon: Users },
  ];

  return (
    <AppShell title="Tambah Sesi Baru">
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-navy-900 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setError("");
                if (t.id !== "upload") {
                  setFile(null);
                  setFileKey((k) => k + 1);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-2 text-[10px]",
                tab === t.id
                  ? "bg-accent text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "upload" ? (
        <form onSubmit={submitUpload} className="card space-y-4 p-4">
          <div>
            <label className="label">Judul (opsional)</label>
            <input
              className="input"
              value={title ?? ""}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting offline / telepon..."
            />
          </div>
          <div>
            <label className="label">File audio / video</label>
            <input
              key={fileKey}
              ref={fileRef}
              type="file"
              accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.item(0) ?? null;
                setFile(next);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-surface-border bg-navy-900 px-4 py-10 text-slate-400 hover:border-accent/50"
            >
              <FileAudio className="h-8 w-8 text-accent-soft" />
              <span className="text-sm">
                {file ? file.name : "Ketuk untuk pilih file"}
              </span>
              <span className="text-[11px] text-slate-600">
                mp3, wav, m4a, mp4 · maks 500MB
              </span>
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress}
              </>
            ) : (
              "Mulai Proses"
            )}
          </button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Rekaman telepon: upload manual dari fitur native HP (HyperOS). Proses
            berjalan di background — Anda bisa tutup layar.
          </p>
          <a href="/record" className="btn-ghost w-full text-xs">
            Atau rekam langsung via mic (Fase 2)
          </a>
        </form>
      ) : (
        <form onSubmit={submitLink} className="card space-y-4 p-4">
          <div>
            <label className="label">Judul (opsional)</label>
            <input
              className="input"
              value={title ?? ""}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul sesi..."
            />
          </div>
          <div>
            <label className="label">
              {tab === "youtube"
                ? "Link YouTube"
                : tab === "loom"
                  ? "Link Loom"
                  : "Link Zoom / Meet / Teams"}
            </label>
            <input
              className="input"
              value={url ?? ""}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                tab === "youtube"
                  ? "https://youtube.com/watch?v=..."
                  : tab === "loom"
                    ? "https://www.loom.com/share/..."
                    : "https://meet.google.com/..."
              }
              inputMode="url"
            />
          </div>
          {tab === "meeting" && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
              Fase 2: butuh RECALL_AI_API_KEY. Bot join meeting, audio ditranskrip
              via AssemblyAI (bukan engine Recall).
            </p>
          )}
          {tab === "youtube" && (
            <p className="text-[11px] text-slate-500">
              Caption YouTube dipakai jika ada; jika tidak, butuh STT (lebih lama).
            </p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress}
              </>
            ) : (
              "Mulai Proses"
            )}
          </button>
        </form>
      )}
    </AppShell>
  );
}
