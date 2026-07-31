import type { TranscriptSegment } from "../stt/types";

export interface YoutubeCaptionResult {
  text: string;
  language?: string;
  hasCaptions: boolean;
  segments: TranscriptSegment[];
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

/**
 * InnerTube (YouTube internal API) via the Android client.
 * The old approach — scraping /watch and following the embedded caption
 * baseUrl — now returns HTTP 200 with an empty body: that endpoint requires a
 * PoToken tied to a web player session. The Android client still hands back
 * caption URLs that serve real content.
 */
const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player";
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const ANDROID_CLIENT_VERSION = "20.10.38";
const ANDROID_USER_AGENT = `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 11) gzip`;
const REQUEST_TIMEOUT_MS = 20_000;

/** Language preference, best first. Matches exact code or `code-REGION`. */
const LANGUAGE_PREFERENCE = ["id", "en"];

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/").filter(Boolean);
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    const shortsIdx = parts.indexOf("shorts");
    if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    return null;
  } catch {
    return null;
  }
}

function decodeEntities(input: string): string {
  // YouTube double-encodes, so `&amp;` is resolved before numeric refs:
  // `&amp;#39;` -> `&#39;` -> `'`
  return input
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(raw: string): string {
  // Drop inner markup (srv3 wraps auto-caption words in <s>) before decoding,
  // so decoded `&lt;` in the caption itself is never treated as a tag.
  return decodeEntities(raw.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Parse srv3 (`<p t="ms" d="ms">`) with a fallback to the legacy
 * transcript format (`<text start="sec" dur="sec">`). Times are normalised
 * to seconds.
 */
function parseCaptionXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  const srv3 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = srv3.exec(xml)) !== null) {
    const text = cleanText(match[2]);
    if (!text) continue;
    const start = Number(/\bt="(-?\d+)"/.exec(match[1])?.[1] ?? 0) / 1000;
    const duration = Number(/\bd="(-?\d+)"/.exec(match[1])?.[1] ?? 0) / 1000;
    segments.push({
      text,
      start,
      end: start + Math.max(duration, 0),
      speaker: "Speaker A",
    });
  }
  if (segments.length > 0) return segments;

  const legacy = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  while ((match = legacy.exec(xml)) !== null) {
    const text = cleanText(match[2]);
    if (!text) continue;
    const start = Number(/\bstart="([\d.]+)"/.exec(match[1])?.[1] ?? 0);
    const duration = Number(/\bdur="([\d.]+)"/.exec(match[1])?.[1] ?? 0);
    segments.push({
      text,
      start,
      end: start + Math.max(duration, 0),
      speaker: "Speaker A",
    });
  }
  return segments;
}

/** Prefer id > en > anything, and human-written captions over auto-generated. */
function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const rank = (track: CaptionTrack) => {
    const lang = (track.languageCode || "").toLowerCase();
    let langRank = LANGUAGE_PREFERENCE.findIndex(
      (p) => lang === p || lang.startsWith(`${p}-`)
    );
    if (langRank < 0) langRank = LANGUAGE_PREFERENCE.length;
    return langRank * 2 + (track.kind === "asr" ? 1 : 0);
  };
  return [...tracks].sort((a, b) => rank(a) - rank(b))[0] || null;
}

function playabilityError(status: string, reason?: string): string {
  switch (status) {
    case "LOGIN_REQUIRED":
      return "Video YouTube privat atau perlu login. Gunakan link publik.";
    case "AGE_VERIFICATION_REQUIRED":
    case "CONTENT_CHECK_REQUIRED":
      return "Video YouTube dibatasi umur, caption tidak bisa diambil otomatis.";
    case "UNPLAYABLE":
      return `Video YouTube tidak bisa diputar${reason ? `: ${reason}` : ""}.`;
    case "ERROR":
      return "Video YouTube tidak ditemukan atau sudah dihapus.";
    default:
      return `Video YouTube tidak bisa diakses (${status}).`;
  }
}

async function fetchPlayerResponse(videoId: string): Promise<{
  captionTracks: CaptionTrack[];
}> {
  let res: Response;
  try {
    res = await fetch(`${INNERTUBE_URL}?key=${INNERTUBE_KEY}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": ANDROID_USER_AGENT,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: ANDROID_CLIENT_VERSION,
            androidSdkVersion: 30,
            hl: "id",
            gl: "ID",
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal menghubungi YouTube: ${message}`);
  }

  if (!res.ok) {
    throw new Error(`Gagal mengakses YouTube (${res.status})`);
  }

  const data = (await res.json()) as {
    playabilityStatus?: { status?: string; reason?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };

  const status = data.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(playabilityError(status, data.playabilityStatus?.reason));
  }

  const captionTracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return { captionTracks: captionTracks.filter((t) => t?.baseUrl) };
}

export async function getYoutubeCaptions(url: string): Promise<YoutubeCaptionResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL YouTube tidak valid");
  }

  const { captionTracks } = await fetchPlayerResponse(videoId);
  if (captionTracks.length === 0) {
    return { text: "", hasCaptions: false, segments: [] };
  }

  const track = pickTrack(captionTracks);
  if (!track) {
    return { text: "", hasCaptions: false, segments: [] };
  }

  let xml: string;
  try {
    const res = await fetch(track.baseUrl, {
      headers: { "user-agent": ANDROID_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    xml = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal mengunduh caption YouTube: ${message}`);
  }

  // The track exists but YouTube served nothing — this is how the blocked
  // web-scrape path fails, and it must not be reported as "no captions".
  if (!xml.trim()) {
    throw new Error(
      "YouTube menolak permintaan caption (respons kosong). Coba lagi nanti, atau upload file audio."
    );
  }

  const segments = parseCaptionXml(xml);
  const text = segments.map((s) => s.text).join(" ").trim();
  if (text.length <= 20) {
    return { text: "", hasCaptions: false, segments: [] };
  }

  return {
    text,
    language: track.languageCode,
    hasCaptions: true,
    segments,
  };
}

export { extractVideoId };
