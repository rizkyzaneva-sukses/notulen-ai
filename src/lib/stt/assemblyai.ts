import { AssemblyAI } from "assemblyai";
import type { SttProvider, SttResult, TranscriptSegment } from "./types";

export class AssemblyAIProvider implements SttProvider {
  name = "assemblyai";
  private client: AssemblyAI;

  constructor(apiKey: string) {
    this.client = new AssemblyAI({ apiKey });
  }

  async transcribe(input: { filePath?: string; audioUrl?: string }): Promise<SttResult> {
    if (!input.filePath && !input.audioUrl) {
      throw new Error("AssemblyAI: filePath or audioUrl required");
    }

    const transcript = await this.client.transcripts.transcribe({
      ...(input.filePath ? { audio: input.filePath } : { audio_url: input.audioUrl! }),
      speaker_labels: true,
      language_detection: true,
    });

    if (transcript.status === "error") {
      throw new Error(transcript.error || "AssemblyAI transcription failed");
    }

    const segments: TranscriptSegment[] = [];
    const speakerSet = new Set<string>();

    if (transcript.utterances && transcript.utterances.length > 0) {
      for (const u of transcript.utterances) {
        const code = u.speaker ? `Speaker ${u.speaker}` : "Speaker A";
        speakerSet.add(code);
        segments.push({
          text: u.text,
          start: u.start / 1000,
          end: u.end / 1000,
          speaker: code,
          confidence: u.confidence,
        });
      }
    } else if (transcript.words && transcript.words.length > 0) {
      // fallback: group words into rough sentences
      let buf = "";
      let start = transcript.words[0].start / 1000;
      let confSum = 0;
      let confN = 0;
      for (const w of transcript.words) {
        buf += (buf ? " " : "") + w.text;
        confSum += w.confidence ?? 0;
        confN++;
        if (/[.!?]$/.test(w.text) || buf.split(" ").length > 25) {
          segments.push({
            text: buf,
            start,
            end: w.end / 1000,
            speaker: "Speaker A",
            confidence: confN ? confSum / confN : undefined,
          });
          speakerSet.add("Speaker A");
          buf = "";
          start = w.end / 1000;
          confSum = 0;
          confN = 0;
        }
      }
      if (buf) {
        const last = transcript.words[transcript.words.length - 1];
        segments.push({
          text: buf,
          start,
          end: last.end / 1000,
          speaker: "Speaker A",
          confidence: confN ? confSum / confN : undefined,
        });
        speakerSet.add("Speaker A");
      }
    } else if (transcript.text) {
      segments.push({
        text: transcript.text,
        start: 0,
        end: (transcript.audio_duration || 0),
        speaker: "Speaker A",
      });
      speakerSet.add("Speaker A");
    }

    const confidences = segments
      .map((s) => s.confidence)
      .filter((c): c is number => typeof c === "number");
    const confidenceAvg =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : transcript.confidence ?? undefined;

    return {
      rawText: transcript.text || segments.map((s) => s.text).join(" "),
      segments,
      language: transcript.language_code || undefined,
      confidenceAvg,
      speakers: Array.from(speakerSet).sort(),
      provider: this.name,
    };
  }
}
