export interface YoutubeCaptionResult {
  text: string;
  language?: string;
  hasCaptions: boolean;
}

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

export { extractVideoId };
