/**
 * Recall.ai meeting bot client (Fase 2)
 */

const BASE = () =>
  (process.env.RECALL_AI_BASE_URL || "https://api.recall.ai/api/v1").replace(/\/$/, "");

function headers() {
  const key = process.env.RECALL_AI_API_KEY;
  if (!key) throw new Error("RECALL_AI_API_KEY is not configured");
  return {
    authorization: `Token ${key}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

export interface RecallBot {
  id: string;
  status?: string;
  meeting_url?: string;
  video_url?: string | null;
  media_shortcuts?: {
    audio_mixed?: { data?: { download_url?: string } };
  };
}

export async function createRecallBot(opts: {
  meetingUrl: string;
  botName?: string;
  sessionId: string;
}): Promise<RecallBot> {
  const webhook = process.env.RECALL_AI_WEBHOOK_URL;
  const body: Record<string, unknown> = {
    meeting_url: opts.meetingUrl,
    bot_name: opts.botName || "Notulen AI",
    metadata: { session_id: opts.sessionId },
  };

  if (webhook) {
    body.recording_config = {
      transcript: { provider: { meeting_captions: {} } },
    };
    // status webhooks depend on Recall plan/config; metadata carries session id
  }

  const res = await fetch(`${BASE()}/bot/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recall.ai create bot failed (${res.status}): ${text}`);
  }

  return (await res.json()) as RecallBot;
}

export async function getRecallBot(botId: string): Promise<RecallBot> {
  const res = await fetch(`${BASE()}/bot/${botId}/`, {
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recall.ai get bot failed (${res.status}): ${text}`);
  }
  return (await res.json()) as RecallBot;
}

export async function getRecallAudioUrl(botId: string): Promise<string | null> {
  const bot = await getRecallBot(botId);
  // various shapes depending on Recall API version
  const mixed = bot.media_shortcuts?.audio_mixed?.data?.download_url;
  if (mixed) return mixed;
  if (bot.video_url) return bot.video_url;
  return null;
}

export async function downloadRecallAudio(
  audioUrl: string,
  destPath: string
): Promise<void> {
  const res = await fetch(audioUrl, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Failed to download Recall audio (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFile, mkdir } = await import("fs/promises");
  const path = await import("path");
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
}
