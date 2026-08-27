import type { LocalAgentSession } from "../types/session.js";
import { toSummary } from "./session-presenters.js";

export type InboxStreamWriter = (event: string, data: unknown) => void;

export class InboxHub {
  private writers = new Set<InboxStreamWriter>();

  subscribe(writer: InboxStreamWriter): () => void {
    this.writers.add(writer);
    return () => this.writers.delete(writer);
  }

  broadcast(event: string, data: unknown): void {
    for (const write of this.writers) {
      try {
        write(event, data);
      } catch (err) {
        console.warn("[sidecar] inbox broadcast failed", err);
      }
    }
  }

  broadcastAgent(session: LocalAgentSession): void {
    if (this.writers.size === 0) return;
    this.broadcast("agent", toSummary(session));
  }

  broadcastRecyclePending(reason: string): void {
    this.broadcast("recycle_pending", { reason, at: new Date().toISOString() });
  }

  snapshot(sessions: Map<string, LocalAgentSession>): void {
    const items = [...sessions.values()]
      .filter((s) => s.status === "ACTIVE")
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(toSummary);
    this.broadcast("snapshot", { items });
  }
}
