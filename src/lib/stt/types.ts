export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  confidence?: number;
}

export interface SttResult {
  rawText: string;
  segments: TranscriptSegment[];
  language?: string;
  confidenceAvg?: number;
  speakers: string[];
  provider: string;
}

export interface SttProvider {
  name: string;
  transcribe(input: { filePath?: string; audioUrl?: string }): Promise<SttResult>;
}
