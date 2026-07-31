export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}

export interface LlmSummaryResult {
  executiveSummary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: Array<{
    description: string;
    owner?: string | null;
    dueDate?: string | null;
  }>;
  mindMap: MindMapNode;
  title?: string;
}

export interface LlmProvider {
  name: string;
  model: string;
  generateSummary(input: {
    transcript: string;
    speakers?: Array<{ code: string; name: string }>;
    sourceHint?: string;
  }): Promise<LlmSummaryResult>;
}
