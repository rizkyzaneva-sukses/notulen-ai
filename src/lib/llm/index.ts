import type { LlmProvider } from "./types";
import { AnthropicLlmProvider } from "./anthropic";

export * from "./types";

export function getLlmProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL || "claude-sonnet-4-20250514";

  if (!apiKey) {
    throw new Error("LLM_API_KEY is not configured");
  }

  // anthropic native or any openai-compatible via same client class
  return new AnthropicLlmProvider({
    apiKey,
    baseUrl:
      baseUrl ||
      (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com"),
    model,
    name: provider,
  });
}
