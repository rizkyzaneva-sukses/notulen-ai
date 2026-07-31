import type { SttProvider } from "./types";
import { AssemblyAIProvider } from "./assemblyai";

export * from "./types";

export function getSttProvider(): SttProvider {
  const provider = (process.env.STT_PROVIDER || "assemblyai").toLowerCase();
  const apiKey = process.env.STT_API_KEY;

  if (!apiKey) {
    throw new Error("STT_API_KEY is not configured");
  }

  switch (provider) {
    case "assemblyai":
      return new AssemblyAIProvider(apiKey);
    default:
      throw new Error(`Unsupported STT_PROVIDER: ${provider}`);
  }
}
