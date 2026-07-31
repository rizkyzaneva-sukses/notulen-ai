import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function estimateProcessMinutes(durationSeconds: number | null | undefined): number {
  if (!durationSeconds) return 5;
  // rough: STT ~0.1x realtime + LLM ~1-2 min
  return Math.max(2, Math.ceil(durationSeconds / 600) + 2);
}

export const SOURCE_LABELS: Record<string, string> = {
  UPLOAD: "Upload File",
  YOUTUBE: "YouTube",
  LOOM: "Loom",
  MEETING_BOT: "Meeting Bot",
  IN_APP_RECORD: "Rekaman In-App",
};

export const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Antrian",
  TRANSCRIBING: "Transkripsi",
  TRANSCRIBED: "Tersalin",
  SUMMARIZING: "Meringkas",
  DONE: "Selesai",
  FAILED: "Gagal",
};

export const CATEGORY_LABELS: Record<string, string> = {
  PEBISNIS: "Pebisnis",
  SUAMI: "Suami",
  ANAK: "Anak",
  AYAH: "Ayah",
  INVESTOR: "Investor",
};

export const CATEGORIES = ["PEBISNIS", "SUAMI", "ANAK", "AYAH", "INVESTOR"] as const;

export function detectSourceFromUrl(url: string): "YOUTUBE" | "LOOM" | "MEETING_BOT" | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("youtube.com") || host === "youtu.be") return "YOUTUBE";
    if (host.includes("loom.com")) return "LOOM";
    if (
      host.includes("zoom.us") ||
      host.includes("meet.google.com") ||
      host.includes("teams.microsoft.com") ||
      host.includes("teams.live.com")
    ) {
      return "MEETING_BOT";
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
]);

export const ALLOWED_EXT = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "mp4",
  "webm",
  "mov",
  "avi",
]);
