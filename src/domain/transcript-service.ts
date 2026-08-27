import { createHash } from "node:crypto";
import type { LocalRun } from "../types/session.js";
import type { TranscriptLine } from "../types/transcript.js";

export function eventDataText(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const text = (data as { text?: unknown }).text;
  return typeof text === "string" ? text : undefined;
}

export function prettyJSON(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function stableTurnId(agentId: string, runId: string, userIndex: number): string {
  const seed = `${agentId}|${runId}|turn|${userIndex}`;
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function coalesceRunEvents(run: LocalRun): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let assistantBuf = "";
  let thinkingBuf = "";
  const toolByCall = new Map<string, TranscriptLine>();
  let userTurnIndex = 0;

  const flushAssistant = () => {
    if (!assistantBuf) return;
    lines.push({ kind: "assistant", text: assistantBuf });
    assistantBuf = "";
  };
  const flushThinking = () => {
    if (!thinkingBuf) return;
    lines.push({ kind: "thinking", text: thinkingBuf });
    thinkingBuf = "";
  };

  for (const e of run.events) {
    switch (e.event) {
      case "user": {
        flushThinking();
        flushAssistant();
        const text = eventDataText(e.data)?.trim();
        if (text) {
          lines.push({
            kind: "user",
            text,
            turnId: stableTurnId(run.agentId, run.id, userTurnIndex++),
          });
        }
        break;
      }
      case "assistant": {
        flushThinking();
        const text = eventDataText(e.data);
        if (!text) break;
        if (!assistantBuf) assistantBuf = text;
        else if (text.startsWith(assistantBuf)) assistantBuf = text;
        else if (assistantBuf.endsWith(text)) {
          /* duplicate delta */
        } else {
          assistantBuf += text;
        }
        break;
      }
      case "thinking": {
        flushAssistant();
        const text = eventDataText(e.data);
        if (!text) break;
        if (!thinkingBuf) thinkingBuf = text;
        else if (text.startsWith(thinkingBuf)) thinkingBuf = text;
        else if (!thinkingBuf.endsWith(text)) thinkingBuf += text;
        break;
      }
      case "tool_call": {
        flushThinking();
        flushAssistant();
        const data = (e.data ?? {}) as {
          callId?: string;
          name?: string;
          status?: string;
          args?: unknown;
          result?: unknown;
        };
        const name = data.name ?? "tool";
        const status = data.status ?? "";
        const callId = data.callId ?? `${name}-${lines.length}`;
        const sections: string[] = [];
        if (data.args !== undefined) {
          sections.push("```json\n" + prettyJSON(data.args) + "\n```");
        }
        if (data.result !== undefined) {
          sections.push("```json\n" + prettyJSON(data.result) + "\n```");
        }
        const line: TranscriptLine = {
          kind: "tool",
          text: status ? `${name} (${status})` : name,
          detail: sections.length ? sections.join("\n\n") : undefined,
        };
        const existing = toolByCall.get(callId);
        if (existing) {
          existing.text = line.text;
          existing.detail = line.detail ?? existing.detail;
        } else {
          toolByCall.set(callId, line);
          lines.push(line);
        }
        break;
      }
      case "result": {
        flushThinking();
        flushAssistant();
        const data = (e.data ?? {}) as { text?: string; status?: string };
        const text = typeof data.text === "string" ? data.text.trim() : "";
        const status = String(data.status ?? "").toUpperCase();
        if (text) {
          if (status === "ERROR") {
            lines.push({ kind: "system", text });
          } else {
            const last = lines[lines.length - 1];
            if (last?.kind === "assistant") {
              if (
                !last.text ||
                text.startsWith(last.text) ||
                text.includes(last.text)
              ) {
                last.text = text;
              }
            } else {
              lines.push({ kind: "assistant", text });
            }
          }
        }
        break;
      }
      case "error": {
        flushThinking();
        flushAssistant();
        const data = (e.data ?? {}) as { message?: string };
        const message =
          typeof data.message === "string" ? data.message.trim() : "";
        if (message) lines.push({ kind: "system", text: message });
        break;
      }
      default:
        break;
    }
  }
  flushThinking();
  flushAssistant();

  if (lines.length === 0) {
    const prompt = run.prompt?.trim();
    if (prompt) {
      lines.push({
        kind: "user",
        text: prompt,
        turnId: stableTurnId(run.agentId, run.id, userTurnIndex++),
      });
    }
    const result = run.result?.trim();
    if (result) {
      lines.push({
        kind: run.status === "ERROR" ? "system" : "assistant",
        text: result,
      });
    }
  }

  assignTurnIdsToLines(lines);
  return lines;
}

/** Propagate turnId from user lines to following non-user lines. */
export function assignTurnIdsToLines(lines: TranscriptLine[]): void {
  let currentTurnId: string | undefined;
  for (const line of lines) {
    if (line.kind === "user" && line.turnId) {
      currentTurnId = line.turnId;
    } else if (currentTurnId) {
      line.turnId = currentTurnId;
    }
  }
}
