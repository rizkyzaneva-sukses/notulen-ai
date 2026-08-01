import type { TranscriptSegment } from "../stt/types";

export interface YoutubeCaptionResult {
  text: string;
  language?: string;
  hasCaptions: boolean;
  segments: TranscriptSegment[];
  /** Which route produced these captions — surfaced as the STT provider. */
  source?: "innertube" | "yt-dlp";
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
const IOS_CLIENT_VERSION = "20.10.4";
const IOS_USER_AGENT = `com.google.ios.youtube/${IOS_CLIENT_VERSION} (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)`;
const REQUEST_TIMEOUT_MS = 20_000;

interface InnertubeClient {
  label: string;
  userAgent: string;
  client: Record<string, unknown>;
}

/**
 * Tried in order until one answers OK. YouTube rejects clients unevenly —
 * a datacenter IP that gets LOGIN_REQUIRED on ANDROID sometimes still passes
 * on IOS, so a second attempt is worth the extra round trip.
 *
 * MWEB/WEB are deliberately absent: they now require a PoToken and answer
 * UNPLAYABLE even from a clean residential IP. ANDROID_VR and TVHTML5 answer
 * LOGIN_REQUIRED under the same conditions.
 */
const INNERTUBE_CLIENTS: InnertubeClient[] = [
  {
    label: "ANDROID",
    userAgent: ANDROID_USER_AGENT,
    client: {
      clientName: "ANDROID",
      clientVersion: ANDROID_CLIENT_VERSION,
      androidSdkVersion: 30,
    },
  },
  {
    label: "IOS",
    userAgent: IOS_USER_AGENT,
    client: {
      clientName: "IOS",
      clientVersion: IOS_CLIENT_VERSION,
      deviceModel: "iPhone16,2",
    },
  },
];

/** Language preference, best first. Matches exact code or `code-REGION`. */
const LANGUAGE_PREFERENCE = ["id", "en"];

const YT_AUDIO_PREFIX = "yt-audio-";
const YT_SUB_PREFIX = "yt-sub-";
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

interface CookieHandle {
  flags: { cookies?: string };
  cleanup: () => Promise<void>;
}

/**
 * yt-dlp has deprecated extraction without a JS runtime — without one it
 * cannot decipher signatures and reports "Requested format is not available".
 * The runtime image is node:22, so the interpreter is already on PATH and no
 * extra dependency (Deno) is needed.
 */
const YT_DLP_JS_RUNTIME = { jsRuntimes: "node" } as const;

/**
 * yt-dlp still resolves a format under --skip-download, so a video whose
 * formats cannot be extracted aborts the subtitle fetch as well. Subtitles do
 * not depend on formats, so let it carry on regardless.
 *
 * Absent from youtube-dl-exec's typings; dargs forwards any key as a CLI flag,
 * so this reaches yt-dlp as --ignore-no-formats-error.
 */
const YT_DLP_IGNORE_NO_FORMATS: { ignoreNoFormatsError: boolean } = {
  ignoreNoFormatsError: true,
};

/**
 * Optional `--cookies` file for yt-dlp. YouTube blocks datacenter IPs with
 * "Sign in to confirm you're not a bot"; a logged-in cookie jar gets past it.
 * Unset means yt-dlp runs anonymously, exactly as before.
 *
 * yt-dlp saves the jar back to disk when it finishes, which fails on the
 * read-only file mounts that panels typically use — so it is handed a
 * throwaway copy and the original is never written to.
 */
async function ytDlpCookies(): Promise<CookieHandle> {
  const file = process.env.YOUTUBE_COOKIES_FILE?.trim();
  if (!file) return { flags: {}, cleanup: async () => {} };

  try {
    const { copyFile, mkdtemp, rm } = await import("fs/promises");
    const { tmpdir } = await import("os");
    const nodePath = await import("path");
    const dir = await mkdtemp(nodePath.join(tmpdir(), "yt-cookies-"));
    const copy = nodePath.join(dir, "cookies.txt");
    await copyFile(file, copy);
    return {
      flags: { cookies: copy },
      cleanup: async () => {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[youtube] gagal menyalin cookies (${message}); pakai file aslinya`
    );
    return { flags: { cookies: file }, cleanup: async () => {} };
  }
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.includes("youtu.be")) {
      id = u.pathname.slice(1).split("/")[0] || null;
    } else if (u.searchParams.get("v")) {
      id = u.searchParams.get("v");
    } else {
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) id = parts[embedIdx + 1];
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) id = parts[shortsIdx + 1];
    }
    return id && VIDEO_ID_RE.test(id) ? id : null;
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

/**
 * Raised when no InnerTube client could reach the video. `detail` keeps the
 * per-client status/reason so a bot block ("Sign in to confirm you're not a
 * bot") stays distinguishable from a genuinely private video — the two share
 * the LOGIN_REQUIRED status but need completely different fixes.
 */
export class YoutubeAccessError extends Error {
  readonly detail: string;
  constructor(message: string, detail: string) {
    super(detail ? `${message} [${detail}]` : message);
    this.name = "YoutubeAccessError";
    this.detail = detail;
  }
}

function playabilityError(status: string, reason?: string): string {
  switch (status) {
    case "LOGIN_REQUIRED":
      // Not necessarily private: YouTube returns this to unattested clients
      // and to datacenter IPs it suspects of automation.
      return "YouTube menolak akses ke video ini. Video privat, atau IP server diblokir YouTube.";
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

interface PlayerAttempt {
  captionTracks?: CaptionTrack[];
  /** Human-readable failure for this client, e.g. `ANDROID: LOGIN_REQUIRED`. */
  failure?: string;
  /** Message shown to the user if every client fails the same way. */
  userMessage?: string;
}

async function fetchPlayerResponseWith(
  videoId: string,
  entry: InnertubeClient
): Promise<PlayerAttempt> {
  let res: Response;
  try {
    res = await fetch(`${INNERTUBE_URL}?key=${INNERTUBE_KEY}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": entry.userAgent,
      },
      body: JSON.stringify({
        videoId,
        context: { client: { ...entry.client, hl: "id", gl: "ID" } },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      failure: `${entry.label}: ${message}`,
      userMessage: `Gagal menghubungi YouTube: ${message}`,
    };
  }

  if (!res.ok) {
    return {
      failure: `${entry.label}: HTTP ${res.status}`,
      userMessage: `Gagal mengakses YouTube (${res.status})`,
    };
  }

  const data = (await res.json()) as {
    playabilityStatus?: { status?: string; reason?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };

  const status = data.playabilityStatus?.status;
  const reason = data.playabilityStatus?.reason;
  if (status && status !== "OK") {
    return {
      failure: `${entry.label}: ${status}${reason ? ` (${reason})` : ""}`,
      userMessage: playabilityError(status, reason),
    };
  }

  const captionTracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return { captionTracks: captionTracks.filter((t) => t?.baseUrl) };
}

async function fetchPlayerResponse(videoId: string): Promise<{
  captionTracks: CaptionTrack[];
}> {
  const failures: string[] = [];
  let userMessage = "Video YouTube tidak bisa diakses.";

  for (const entry of INNERTUBE_CLIENTS) {
    const attempt = await fetchPlayerResponseWith(videoId, entry);
    if (attempt.captionTracks) {
      if (failures.length > 0) {
        console.warn(
          `[youtube] ${entry.label} berhasil setelah gagal di: ${failures.join("; ")}`
        );
      }
      return { captionTracks: attempt.captionTracks };
    }
    failures.push(attempt.failure!);
    // keep the first client's wording: it is the most representative
    if (failures.length === 1 && attempt.userMessage) {
      userMessage = attempt.userMessage;
    }
  }

  throw new YoutubeAccessError(userMessage, failures.join("; "));
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
    source: "innertube",
  };
}

/**
 * Second caption route, used when InnerTube is refused. yt-dlp downloads the
 * subtitle track directly — with `YOUTUBE_COOKIES_FILE` set it clears the bot
 * check that blocks the API. Far cheaper than the audio fallback below: no
 * download, no STT minutes billed.
 *
 * srv3 is requested specifically because `parseCaptionXml` already reads it
 * with real timings; ttml/vtt would need a separate parser to avoid silently
 * flattening every timestamp to zero.
 */
export async function getYoutubeCaptionsViaYtDlp(
  url: string,
  destDir: string
): Promise<YoutubeCaptionResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL YouTube tidak valid");
  }

  const { readdir, readFile, unlink } = await import("fs/promises");
  const path = await import("path");
  const { default: youtubedl } = await import("youtube-dl-exec");

  const outputTemplate = path.join(destDir, `${YT_SUB_PREFIX}${videoId}.%(ext)s`);
  const safeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const cookies = await ytDlpCookies();
  let downloadError: string | null = null;
  try {
    await youtubedl(safeUrl, {
      skipDownload: true,
      // legacy flag spellings — youtube-dl-exec types them this way, and
      // yt-dlp still accepts them as aliases of --write-subs/--sub-langs
      writeSub: true,
      writeAutoSub: true,
      subLang: LANGUAGE_PREFERENCE.join(","),
      subFormat: "srv3",
      output: outputTemplate,
      noPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true,
      ...YT_DLP_JS_RUNTIME,
      ...YT_DLP_IGNORE_NO_FORMATS,
      ...cookies.flags,
    });
  } catch (err) {
    // Partial success is normal: yt-dlp fetches one language per request, so
    // it can save `id` and then hit a 429 on `en` and exit non-zero. Whatever
    // reached disk is still usable, so this only becomes fatal if the scan
    // below turns up nothing.
    downloadError = err instanceof Error ? err.message : String(err);
  } finally {
    await cookies.cleanup();
  }

  const prefix = `${YT_SUB_PREFIX}${videoId}.`;
  const files = (await readdir(destDir)).filter(
    (f) => f.startsWith(prefix) && f.endsWith(".srv3")
  );
  if (files.length === 0) {
    if (downloadError) {
      throw new Error(`Gagal mengambil caption via yt-dlp: ${downloadError}`);
    }
    return { text: "", hasCaptions: false, segments: [] };
  }
  if (downloadError) {
    console.warn(
      `[youtube] yt-dlp sebagian gagal (${downloadError}); memakai subtitle yang berhasil terunduh`
    );
  }

  // filename is `yt-sub-<id>.<lang>.srv3`; apply the same language preference
  const langOf = (f: string) => f.slice(prefix.length).replace(/\.srv3$/, "");
  const best = [...files].sort((a, b) => {
    const rank = (f: string) => {
      const lang = langOf(f).toLowerCase();
      const i = LANGUAGE_PREFERENCE.findIndex(
        (p) => lang === p || lang.startsWith(`${p}-`)
      );
      return i < 0 ? LANGUAGE_PREFERENCE.length : i;
    };
    return rank(a) - rank(b);
  })[0];

  const xml = await readFile(path.join(destDir, best), "utf8");
  await Promise.all(
    files.map((f) => unlink(path.join(destDir, f)).catch(() => {}))
  );

  const segments = parseCaptionXml(xml);
  const text = segments.map((s) => s.text).join(" ").trim();
  if (text.length <= 20) {
    return { text: "", hasCaptions: false, segments: [] };
  }

  return {
    text,
    language: langOf(best),
    hasCaptions: true,
    segments,
    source: "yt-dlp",
  };
}

/**
 * Fallback for videos without captions: download the audio track via yt-dlp
 * so it can be run through the STT provider like an uploaded file.
 */
export async function downloadYoutubeAudio(
  url: string,
  destDir: string
): Promise<string> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL YouTube tidak valid");
  }

  const { readdir } = await import("fs/promises");
  const path = await import("path");
  const { default: youtubedl } = await import("youtube-dl-exec");

  const maxMb = Number(process.env.MAX_UPLOAD_MB) || 500;
  const outputTemplate = path.join(destDir, `${YT_AUDIO_PREFIX}${videoId}.%(ext)s`);
  // reconstruct a canonical URL from the validated video ID rather than passing
  // the raw user-supplied string to the spawned yt-dlp process
  const safeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const cookies = await ytDlpCookies();
  try {
    await youtubedl(safeUrl, {
      format: "bestaudio/best",
      output: outputTemplate,
      noPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true,
      maxFilesize: `${maxMb}M`,
      ...YT_DLP_JS_RUNTIME,
      ...cookies.flags,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal mengunduh audio dari YouTube: ${message}`);
  } finally {
    await cookies.cleanup();
  }

  const files = await readdir(destDir);
  const match = files.find((f) => f.startsWith(`${YT_AUDIO_PREFIX}${videoId}.`));
  if (!match) {
    throw new Error("Gagal mengunduh audio dari YouTube: file tidak ditemukan setelah unduh");
  }
  return path.join(destDir, match);
}

export { extractVideoId };
