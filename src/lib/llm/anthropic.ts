import type { LlmProvider, LlmSummaryResult, MindMapNode } from "./types";
import { buildSummaryPrompt } from "./prompt";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // strip markdown fences if present
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  // try direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // find first { ... last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("LLM response is not valid JSON");
  }
}

function normalizeMindMap(node: unknown, fallbackLabel: string): MindMapNode {
  if (!node || typeof node !== "object") {
    return { id: "root", label: fallbackLabel, children: [] };
  }
  const n = node as Record<string, unknown>;
  const children = Array.isArray(n.children)
    ? n.children.map((c, i) => {
        const child = normalizeMindMap(c, `Item ${i + 1}`);
        return child;
      })
    : [];
  return {
    id: String(n.id || "root"),
    label: String(n.label || fallbackLabel),
    children: children.length ? children : undefined,
  };
}

function normalizeResult(data: unknown, model: string): LlmSummaryResult {
  const d = (data || {}) as Record<string, unknown>;
  const keyPoints = Array.isArray(d.keyPoints)
    ? d.keyPoints.map(String)
    : Array.isArray(d.key_points)
      ? (d.key_points as unknown[]).map(String)
      : [];
  const decisions = Array.isArray(d.decisions) ? d.decisions.map(String) : [];
  const actionItemsRaw = Array.isArray(d.actionItems)
    ? d.actionItems
    : Array.isArray(d.action_items)
      ? d.action_items
      : [];
  const actionItems = actionItemsRaw.map((item) => {
    const a = (item || {}) as Record<string, unknown>;
    return {
      description: String(a.description || ""),
      owner: a.owner != null ? String(a.owner) : null,
      dueDate: a.dueDate != null ? String(a.dueDate) : a.due_date != null ? String(a.due_date) : null,
    };
  }).filter((a) => a.description.trim().length > 0);

  const executive =
    String(d.executiveSummary || d.executive_summary || "").trim() ||
    "Ringkasan tidak tersedia.";

  return {
    executiveSummary: executive,
    keyPoints,
    decisions,
    actionItems,
    mindMap: normalizeMindMap(d.mindMap || d.mind_map, "Ringkasan"),
    title: d.title ? String(d.title).slice(0, 120) : undefined,
  };
}

export class AnthropicLlmProvider implements LlmProvider {
  name: string;
  model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(opts: { apiKey: string; baseUrl?: string; model?: string; name?: string }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    this.model = opts.model || "claude-sonnet-4-20250514";
    this.name = opts.name || "anthropic";
  }

  async generateSummary(input: {
    transcript: string;
    speakers?: Array<{ code: string; name: string }>;
    sourceHint?: string;
  }): Promise<LlmSummaryResult> {
    const prompt = buildSummaryPrompt(input);

    // Anthropic Messages API
    if (this.name === "anthropic" || this.baseUrl.includes("anthropic.com")) {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.find((c) => c.type === "text")?.text || "";
      return normalizeResult(extractJson(text), this.model);
    }

    // OpenAI-compatible chat completions
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You are a professional meeting note assistant. Reply with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content || "";
    return normalizeResult(extractJson(text), this.model);
  }
}
