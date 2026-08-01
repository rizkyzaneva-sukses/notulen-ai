import { prisma } from "./db";
import { getSttProvider } from "./stt";
import { getLlmProvider } from "./llm";
import {
  getYoutubeCaptions,
  downloadYoutubeAudio,
  type YoutubeCaptionResult,
} from "./sources/youtube";
import { getLoomTranscript } from "./sources/loom";
import {
  createRecallBot,
  getRecallAudioUrl,
  downloadRecallAudio,
} from "./sources/recall";
import { ensureSessionDir } from "./storage";
import { sendPushToAll } from "./push";
import path from "path";
import type { SessionStatus } from "@prisma/client";

async function setStatus(
  sessionId: string,
  status: SessionStatus,
  errorMessage?: string | null
) {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status,
      errorMessage: errorMessage ?? null,
    },
  });
}

function segmentsFromPlainText(text: string) {
  const chunks = text
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  let t = 0;
  return chunks.map((c) => {
    const start = t;
    const end = t + Math.max(2, c.split(/\s+/).length * 0.4);
    t = end;
    return { text: c, start, end, speaker: "Speaker A" as string };
  });
}

export async function processSession(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { speakers: true, transcript: true },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  try {
    await setStatus(sessionId, "TRANSCRIBING");

    let transcriptText = "";
    let segments: Array<{
      text: string;
      start: number;
      end: number;
      speaker?: string;
      confidence?: number;
    }> = [];
    let language: string | undefined;
    let confidenceAvg: number | undefined;
    let speakers: string[] = [];
    let sttProvider = "none";

    if (session.sourceType === "YOUTUBE" && session.sourceUrl) {
      // A caption failure must not end the job. yt-dlp reaches YouTube over a
      // different path and often still succeeds when InnerTube is refused, so
      // the error is recorded and the audio fallback below gets its turn.
      let captions: YoutubeCaptionResult | null = null;
      let captionError: string | null = null;
      try {
        captions = await getYoutubeCaptions(session.sourceUrl);
      } catch (err) {
        captionError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[process] caption YouTube gagal (${captionError}); fallback ke unduh audio`
        );
      }

      if (captions?.hasCaptions && captions.text) {
        transcriptText = captions.text;
        // captions carry real timings; only fall back to estimates if absent
        segments = captions.segments.length
          ? captions.segments
          : segmentsFromPlainText(captions.text);
        language = captions.language;
        speakers = ["Speaker A"];
        sttProvider = "youtube-captions";
      } else {
        // fallback: no captions available — download the audio ourselves and run STT
        let filePath = session.filePath;
        if (!filePath) {
          try {
            const dir = await ensureSessionDir(sessionId);
            filePath = await downloadYoutubeAudio(session.sourceUrl, dir);
            await prisma.session.update({
              where: { id: sessionId },
              data: { filePath },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
              captionError
                ? `${captionError} Fallback unduh audio juga gagal: ${message}. Silakan download audio manual lalu upload.`
                : `${message}. Silakan download audio manual lalu upload, atau sediakan file audio.`
            );
          }
        }
        const stt = getSttProvider();
        const result = await stt.transcribe({ filePath });
        transcriptText = result.rawText;
        segments = result.segments;
        language = result.language;
        confidenceAvg = result.confidenceAvg;
        speakers = result.speakers;
        sttProvider = result.provider;
      }
    } else if (session.sourceType === "LOOM" && session.sourceUrl) {
      const loom = await getLoomTranscript(session.sourceUrl);
      transcriptText = loom.text;
      segments = segmentsFromPlainText(loom.text);
      speakers = ["Speaker A"];
      sttProvider = "loom-transcript";
      if (loom.title && session.title.startsWith("Loom")) {
        await prisma.session.update({
          where: { id: sessionId },
          data: { title: loom.title.slice(0, 120) },
        });
      }
    } else if (session.sourceType === "MEETING_BOT" && session.sourceUrl) {
      // Fase 2: create bot if not already, wait for audio
      const bot = await createRecallBot({
        meetingUrl: session.sourceUrl,
        sessionId,
      });
      // store bot id in errorMessage temporarily? better: sourceUrl already meeting url
      // poll for audio (max ~4 hours in 30s steps would be long — poll limited)
      let audioUrl: string | null = null;
      const maxAttempts = 120; // 120 * 30s = 60 min
      for (let i = 0; i < maxAttempts; i++) {
        audioUrl = await getRecallAudioUrl(bot.id);
        if (audioUrl) break;
        await new Promise((r) => setTimeout(r, 30_000));
      }
      if (!audioUrl) {
        throw new Error("Recall.ai: audio belum tersedia setelah menunggu");
      }
      const dir = await ensureSessionDir(sessionId);
      const filePath = path.join(dir, "recall-audio.mp4");
      await downloadRecallAudio(audioUrl, filePath);
      await prisma.session.update({
        where: { id: sessionId },
        data: { filePath },
      });
      const stt = getSttProvider();
      const result = await stt.transcribe({ filePath });
      transcriptText = result.rawText;
      segments = result.segments;
      language = result.language;
      confidenceAvg = result.confidenceAvg;
      speakers = result.speakers;
      sttProvider = result.provider;
    } else {
      // UPLOAD / IN_APP_RECORD
      if (!session.filePath) {
        throw new Error("File audio tidak ditemukan");
      }
      const stt = getSttProvider();
      const result = await stt.transcribe({ filePath: session.filePath });
      transcriptText = result.rawText;
      segments = result.segments;
      language = result.language;
      confidenceAvg = result.confidenceAvg;
      speakers = result.speakers;
      sttProvider = result.provider;
    }

    if (!transcriptText.trim()) {
      throw new Error("Transkrip kosong");
    }

    // duration from segments
    const lastEnd = segments.reduce((m, s) => Math.max(m, s.end || 0), 0);
    if (lastEnd > 0) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { durationSeconds: Math.ceil(lastEnd) },
      });
    }

    // speakers upsert
    for (const code of speakers.length ? speakers : ["Speaker A"]) {
      await prisma.speaker.upsert({
        where: {
          sessionId_speakerCode: { sessionId, speakerCode: code },
        },
        create: {
          sessionId,
          speakerCode: code,
          displayName: code,
        },
        update: {},
      });
    }

    await prisma.transcript.upsert({
      where: { sessionId },
      create: {
        sessionId,
        rawText: transcriptText,
        segments,
        language: language || null,
        sttProvider,
        confidenceAvg: confidenceAvg ?? null,
      },
      update: {
        rawText: transcriptText,
        segments,
        language: language || null,
        sttProvider,
        confidenceAvg: confidenceAvg ?? null,
      },
    });

    await setStatus(sessionId, "TRANSCRIBED");
    await generateSummaryForSession(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`processSession ${sessionId} failed:`, message);
    await setStatus(sessionId, "FAILED", message);
    throw err;
  }
}

export async function generateSummaryForSession(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      transcript: true,
      speakers: true,
    },
  });

  if (!session?.transcript) {
    throw new Error("Transkrip belum tersedia");
  }

  try {
    await setStatus(sessionId, "SUMMARIZING");

    const llm = getLlmProvider();
    const speakerMap = session.speakers.map((s) => ({
      code: s.speakerCode,
      name: s.displayName,
    }));

    // apply display names into transcript for better owner extraction
    let text = session.transcript.rawText;
    for (const s of session.speakers) {
      if (s.displayName !== s.speakerCode) {
        text = text.split(s.speakerCode).join(s.displayName);
      }
    }

    const result = await llm.generateSummary({
      transcript: text,
      speakers: speakerMap,
      sourceHint: session.sourceType,
    });

    await prisma.summary.upsert({
      where: { sessionId },
      create: {
        sessionId,
        executiveSummary: result.executiveSummary,
        keyPoints: result.keyPoints,
        decisions: result.decisions,
        llmProvider: llm.name,
        llmModel: llm.model,
      },
      update: {
        executiveSummary: result.executiveSummary,
        keyPoints: result.keyPoints,
        decisions: result.decisions,
        llmProvider: llm.name,
        llmModel: llm.model,
        generatedAt: new Date(),
      },
    });

    // replace action items
    await prisma.actionItem.deleteMany({ where: { sessionId } });
    if (result.actionItems.length > 0) {
      await prisma.actionItem.createMany({
        data: result.actionItems.map((a) => ({
          sessionId,
          description: a.description,
          owner: a.owner || null,
          dueDate: a.dueDate && !Number.isNaN(Date.parse(a.dueDate))
            ? new Date(a.dueDate)
            : null,
        })),
      });
    }

    const mindMapJson = JSON.parse(JSON.stringify(result.mindMap)) as object;
    await prisma.mindMap.upsert({
      where: { sessionId },
      create: {
        sessionId,
        structure: mindMapJson,
      },
      update: {
        structure: mindMapJson,
        generatedAt: new Date(),
      },
    });

    if (result.title) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { title: result.title, status: "DONE", errorMessage: null },
      });
    } else {
      await setStatus(sessionId, "DONE");
    }

    await sendPushToAll({
      title: "Resume siap",
      body: result.title || session.title,
      url: `/sessions/${sessionId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // keep transcript; mark failed but allow regenerate
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: session.transcript ? "TRANSCRIBED" : "FAILED",
        errorMessage: `Gagal generate resume: ${message}`,
      },
    });
    throw err;
  }
}
