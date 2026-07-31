"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Loader2, Mic, Pause, Play, Square } from "lucide-react";

/**
 * Fase 2 — In-app recorder (mic) with draft auto-save
 */
export default function RecordPage() {
  const router = useRouter();
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(4));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function startWaveform(stream: MediaStream) {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: 24 }, (_, i) => {
        const v = data[i % data.length] || 0;
        return Math.max(4, Math.round((v / 255) * 28));
      });
      setLevels(bars);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
        // draft autosave
        try {
          const blob = new Blob(chunksRef.current, { type: mime });
          void blob.arrayBuffer().then((buf) => {
            const b64 = btoa(
              new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), "")
            );
            localStorage.setItem(
              "notulen_draft_rec",
              JSON.stringify({ at: Date.now(), b64, mime })
            );
          });
        } catch {
          // ignore draft errors
        }
      };
      rec.start(1000);
      mediaRef.current = rec;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startWaveform(stream);
    } catch {
      setError("Izin mikrofon ditolak atau tidak tersedia");
    }
  }

  function pause() {
    const rec = mediaRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (rec.state === "paused") {
      rec.resume();
      setPaused(false);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
  }

  async function stopAndUpload() {
    const rec = mediaRef.current;
    if (!rec) return;
    setUploading(true);
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    });
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setRecording(false);

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
    const file = new File([blob], `recording-${Date.now()}.webm`, {
      type: blob.type,
    });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", `Rekaman ${new Date().toLocaleString("id-ID")}`);

    try {
      const res = await fetch("/api/sessions", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload gagal");
      localStorage.removeItem("notulen_draft_rec");
      router.replace(`/sessions/${data.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal upload");
      setUploading(false);
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <AppShell title="Rekam In-App">
      <div className="card flex flex-col items-center gap-6 p-6">
        <p className="text-xs text-slate-500">Fase 2 · Meeting tatap muka / offline</p>
        <div className="flex h-10 items-end gap-1">
          {levels.map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-accent-soft/80 transition-all"
              style={{ height: h }}
            />
          ))}
        </div>
        <p className="font-mono text-3xl tabular-nums text-slate-100">
          {mm}:{ss}
        </p>

        <div className="flex items-center gap-3">
          {!recording ? (
            <button type="button" className="btn-primary !px-6" onClick={start}>
              <Mic className="h-4 w-4" />
              Mulai
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={pause}>
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? "Lanjut" : "Jeda"}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={stopAndUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop & Proses
              </button>
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <p className="text-center text-[11px] text-slate-600">
          Draft disimpan otomatis jika app tertutup. Rekaman telepon tetap upload
          manual (bukan auto-intercept).
        </p>
      </div>
    </AppShell>
  );
}
