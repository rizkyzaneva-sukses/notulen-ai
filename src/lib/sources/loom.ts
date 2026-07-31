export interface LoomTranscriptResult {
  text: string;
  title?: string;
}

/**
 * Extract transcript from Loom share page.
 * Loom embeds transcript JSON in page source / GraphQL-like state.
 */
export async function getLoomTranscript(url: string): Promise<LoomTranscriptResult> {
  let normalized = url.trim();
  if (!normalized.includes("://")) {
    normalized = `https://${normalized}`;
  }

  let pageUrl: URL;
  try {
    pageUrl = new URL(normalized);
  } catch {
    throw new Error("URL Loom tidak valid");
  }

  if (!pageUrl.hostname.includes("loom.com")) {
    throw new Error("URL harus dari loom.com");
  }

  const res = await fetch(pageUrl.toString(), {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error("Loom private/gagal diakses. Pastikan link share publik.");
    }
    throw new Error(`Gagal mengakses Loom (${res.status})`);
  }

  const html = await res.text();

  // title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s*[|\-–]\s*Loom.*/i, "").trim();

  // common patterns for loom transcript embeds
  const patterns = [
    /"raw_transcript"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"transcript"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"phrases"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    /"captions"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;

    // array of phrases
    if (m[1].startsWith("[")) {
      try {
        const arr = JSON.parse(m[1]) as Array<{ value?: string; text?: string; content?: string }>;
        const text = arr
          .map((p) => p.value || p.text || p.content || "")
          .filter(Boolean)
          .join(" ");
        if (text.length > 20) return { text, title };
      } catch {
        // continue
      }
    } else {
      try {
        const text = JSON.parse(`"${m[1]}"`) as string;
        if (text.length > 20) return { text, title };
      } catch {
        const text = m[1]
          .replace(/\\n/g, " ")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        if (text.length > 20) return { text, title };
      }
    }
  }

  // try __NEXT_DATA__ style
  const nextData = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextData?.[1]) {
    try {
      const data = JSON.parse(nextData[1]) as unknown;
      const found = findTranscriptInObject(data);
      if (found && found.length > 20) {
        return { text: found, title };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    "Transkrip Loom tidak ditemukan. Pastikan video memiliki captions/transkrip dan link publik."
  );
}

function findTranscriptInObject(obj: unknown, depth = 0): string | null {
  if (depth > 12 || obj == null) return null;
  if (typeof obj === "string") {
    if (obj.length > 100 && obj.split(" ").length > 15) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    // array of caption segments
    if (
      obj.length > 0 &&
      typeof obj[0] === "object" &&
      obj[0] &&
      ("value" in (obj[0] as object) || "text" in (obj[0] as object))
    ) {
      const text = obj
        .map((p) => {
          const o = p as Record<string, unknown>;
          return String(o.value || o.text || o.content || "");
        })
        .filter(Boolean)
        .join(" ");
      if (text.length > 20) return text;
    }
    for (const item of obj) {
      const f = findTranscriptInObject(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of ["raw_transcript", "transcript", "captions", "phrases", "caption"]) {
      if (key in rec) {
        const f = findTranscriptInObject(rec[key], depth + 1);
        if (f) return f;
      }
    }
    for (const v of Object.values(rec)) {
      const f = findTranscriptInObject(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}
