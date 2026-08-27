/** Unified dedup for onDelta / onStep / stream() SDK event sources. */

export interface ToolCallPayload {
  callId?: string;
  name?: string;
  status?: string;
  args?: unknown;
  result?: unknown;
}

export type PipelineEvent =
  | { type: "assistant"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; payload: ToolCallPayload };

export class RunEventPipeline {
  private assistant = "";
  private thinking = "";
  private seenToolCalls = new Set<string>();

  ingestDelta(update: {
    type: string;
    text?: string;
    callId?: string;
    toolCall?: { type?: string; args?: unknown; result?: unknown };
  }): PipelineEvent[] {
    switch (update.type) {
      case "text-delta":
        if (!update.text) return [];
        this.assistant += update.text;
        return [{ type: "assistant", text: update.text }];
      case "thinking-delta":
        if (!update.text) return [];
        this.thinking += update.text;
        return [{ type: "thinking", text: update.text }];
      case "tool-call-started":
        return this.emitTool({
          callId: update.callId,
          name: update.toolCall?.type ?? "tool",
          status: "running",
          args: update.toolCall?.args,
        });
      case "tool-call-completed":
        return this.emitTool({
          callId: update.callId,
          name: update.toolCall?.type ?? "tool",
          status: "completed",
          args: update.toolCall?.args,
          result: update.toolCall?.result,
        });
      default:
        return [];
    }
  }

  ingestStep(step: {
    type: string;
    message?: { text?: string; type?: string };
  }): PipelineEvent[] {
    if (step.type === "assistantMessage" && step.message?.text) {
      const full = step.message.text;
      if (!this.assistant) {
        this.assistant = full;
        return [{ type: "assistant", text: full }];
      }
      if (full.startsWith(this.assistant)) {
        const suffix = full.slice(this.assistant.length);
        if (suffix) {
          this.assistant = full;
          return [{ type: "assistant", text: suffix }];
        }
        return [];
      }
      return [];
    }
    if (step.type === "thinkingMessage" && step.message?.text) {
      if (!this.thinking) {
        this.thinking = step.message.text;
        return [{ type: "thinking", text: step.message.text }];
      }
    }
    return [];
  }

  ingestStreamAssistant(text: string): PipelineEvent[] {
    if (!text) return [];
    if (this.isDuplicateSnapshot(text, this.assistant)) return [];
    if (text.startsWith(this.assistant)) {
      const suffix = text.slice(this.assistant.length);
      if (suffix) {
        this.assistant = text;
        return [{ type: "assistant", text: suffix }];
      }
      return [];
    }
    this.assistant = text;
    return [{ type: "assistant", text }];
  }

  ingestStreamThinking(text: string): PipelineEvent[] {
    if (!text) return [];
    if (this.isDuplicateSnapshot(text, this.thinking)) return [];
    if (text.startsWith(this.thinking)) {
      const suffix = text.slice(this.thinking.length);
      if (suffix) {
        this.thinking = text;
        return [{ type: "thinking", text: suffix }];
      }
      return [];
    }
    this.thinking = text;
    return [{ type: "thinking", text }];
  }

  ingestStreamTool(payload: ToolCallPayload): PipelineEvent[] {
    return this.emitTool(payload);
  }

  getAssistantText(): string {
    return this.assistant;
  }

  private emitTool(payload: ToolCallPayload): PipelineEvent[] {
    const key = `${payload.callId ?? ""}:${payload.status ?? ""}:${payload.name ?? ""}`;
    if (this.seenToolCalls.has(key)) return [];
    this.seenToolCalls.add(key);
    return [{ type: "tool_call", payload }];
  }

  private isDuplicateSnapshot(text: string, accumulated: string): boolean {
    return (
      accumulated.length >= text.length &&
      (text === accumulated ||
        accumulated.startsWith(text) ||
        accumulated.includes(text))
    );
  }
}
