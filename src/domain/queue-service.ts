import { nanoid } from "nanoid";
import type { LocalAgentSession, ModelSelection } from "../types/session.js";
import type { RunService } from "./run-service.js";
import { parseModelSelection } from "../utils/model.js";
import { nowIso } from "../utils/time.js";
import type { SessionRepository } from "../infra/session-repository.js";
import type { InboxHub } from "./inbox-hub.js";

export class QueueService {
  private draining = new Set<string>();

  constructor(
    private sessionRepo: SessionRepository,
    private inbox: InboxHub,
    private runService: RunService,
  ) {}

  syncQueue(
    session: LocalAgentSession,
    raw: unknown[],
  ): typeof session.pendingQueue {
    const items: typeof session.pendingQueue = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const text = String(row.text ?? "").trim();
      if (!text) continue;
      const existingId = row.id != null ? String(row.id).trim() : "";
      const id = existingId || nanoid(10);
      const mode = row.mode === "plan" ? "plan" : "agent";
      const modelId = String(row.modelId ?? session.model.id);
      const modelParams = Array.isArray(row.modelParams)
        ? (row.modelParams as ModelSelection["params"])
        : undefined;
      items.push({ id, text, mode, modelId, modelParams });
    }
    session.pendingQueue = items;
    session.updatedAt = nowIso();
    this.sessionRepo.persistNow();
    return session.pendingQueue;
  }

  /** Drain the next queued prompt after a run settles (sidecar authority). */
  drain(session: LocalAgentSession): void {
    if (this.draining.has(session.id)) return;
    if (this.runService.sessionIsBusy(session)) return;
    if (session.pendingQueue.length === 0) return;

    this.draining.add(session.id);
    void this.drainNext(session).finally(() => {
      this.draining.delete(session.id);
    });
  }

  private async drainNext(session: LocalAgentSession): Promise<void> {
    if (this.runService.sessionIsBusy(session)) return;
    const next = session.pendingQueue.shift();
    if (!next) return;

    this.sessionRepo.persistNow();
    this.inbox.broadcastAgent(session);

    const mode = next.mode === "plan" ? "plan" : "agent";
    const model = parseModelSelection(
      { id: next.modelId, params: next.modelParams },
      session.model.id,
    );

    const runId = `run-${nanoid(10)}`;
    const createdAt = nowIso();
    const run = {
      id: runId,
      agentId: session.id,
      status: "CREATING" as const,
      createdAt,
      updatedAt: createdAt,
      prompt: next.text,
      events: [],
    };
    session.runs.set(runId, run);
    session.latestRunId = runId;
    session.updatedAt = createdAt;
    this.sessionRepo.persistNow();
    this.inbox.broadcastAgent(session);

    await this.runService.executeRun(session, run, next.text, {
      mode,
      model,
    });
  }
}
