export interface YoutubeCaptionResult {
  text: string;
  language?: string;
  hasCaptions: boolean;
}

const YT_AUDIO_PREFIX = "yt-audio-";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

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

export async function getYoutubeCaptions(url: string): Promise<YoutubeCaptionResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL YouTube tidak valid");
  }

  try {
    // dynamic import — library is CJS-friendly
    const mod = await import("youtube-caption-extractor");
    const getSubtitles =
      (mod as { getSubtitles?: typeof import("youtube-caption-extractor").getSubtitles })
        .getSubtitles ||
      (mod as { default?: { getSubtitles: typeof import("youtube-caption-extractor").getSubtitles } })
        .default?.getSubtitles;

    if (!getSubtitles) {
      return { text: "", hasCaptions: false };
    }

    // try id first, then en
    const languages = ["id", "en", "en-US", "en-GB"];
    for (const lang of languages) {
      try {
        const subs = await getSubtitles({ videoID: videoId, lang });
        if (Array.isArray(subs) && subs.length > 0) {
          const text = subs
            .map((s: { text?: string }) => (s.text || "").replace(/\n/g, " ").trim())
            .filter(Boolean)
            .join(" ");
          if (text.length > 20) {
            return { text, language: lang, hasCaptions: true };
          }
        }
      } catch {
        // try next language
      }
    }

    // last attempt without lang
    try {
      const subs = await getSubtitles({ videoID: videoId });
      if (Array.isArray(subs) && subs.length > 0) {
        const text = subs
          .map((s: { text?: string }) => (s.text || "").replace(/\n/g, " ").trim())
          .filter(Boolean)
          .join(" ");
        if (text.length > 20) {
          return { text, hasCaptions: true };
        }
      }
    } catch {
      // no captions
    }

    return { text: "", hasCaptions: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("YouTube caption extract failed:", message);
    return { text: "", hasCaptions: false };
  }
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

  try {
    await youtubedl(safeUrl, {
      format: "bestaudio/best",
      output: outputTemplate,
      noPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true,
      maxFilesize: `${maxMb}M`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gagal mengunduh audio dari YouTube: ${message}`);
  }

  const files = await readdir(destDir);
  const match = files.find((f) => f.startsWith(`${YT_AUDIO_PREFIX}${videoId}.`));
  if (!match) {
    throw new Error("Gagal mengunduh audio dari YouTube: file tidak ditemukan setelah unduh");
  }
  return path.join(destDir, match);
}

export { extractVideoId };
