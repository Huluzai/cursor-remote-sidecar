import { EXIT_RECYCLE, type SidecarConfig } from "../config.js";
import type { LocalAgentSession } from "../types/session.js";
import { isActiveSidecarRun } from "../domain/run-status.js";
import type { InboxHub } from "../domain/inbox-hub.js";
import type { SessionRepository } from "./session-repository.js";

export class RecycleManager {
  private recycleRequested = false;

  constructor(
    private config: SidecarConfig,
    private sessions: Map<string, LocalAgentSession>,
    private sessionRepo: SessionRepository,
    private inbox: InboxHub,
  ) {}

  anySessionBusy(): boolean {
    for (const s of this.sessions.values()) {
      if (this.sessionIsBusy(s)) return true;
    }
    return false;
  }

  sessionIsBusy(session: LocalAgentSession): boolean {
    if (session.inflight) return true;
    return [...session.runs.values()].some((r) =>
      isActiveSidecarRun(r.status),
    );
  }

  request(reason: string): void {
    if (this.recycleRequested) return;
    this.recycleRequested = true;
    console.warn(`[sidecar] process recycle requested: ${reason}`);
    this.inbox.broadcastRecyclePending(reason);
    void (async () => {
      const deadline = Date.now() + 10 * 60 * 1000;
      while (this.anySessionBusy() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (this.anySessionBusy()) {
        console.warn("[sidecar] recycle: still busy after wait; exiting anyway");
      }
      this.sessionRepo.persistNow();
      for (const s of this.sessions.values()) {
        if (!s.agent) continue;
        try {
          await s.agent[Symbol.asyncDispose]();
        } catch {
          // ignore
        }
      }
      console.warn(
        `[sidecar] exiting with code ${EXIT_RECYCLE} for supervisor restart`,
      );
      process.exit(EXIT_RECYCLE);
    })();
  }

  scheduleTimer(): void {
    if (this.config.recycleMs <= 0) return;
    setTimeout(() => {
      this.request(`scheduled after ${this.config.recycleMs}ms`);
    }, this.config.recycleMs).unref?.();
  }
}
