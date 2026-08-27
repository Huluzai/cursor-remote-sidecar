import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Agent } from "@cursor/sdk";
import type { SidecarConfig } from "../config.js";
import { MAX_EVENTS_PER_RUN } from "../config.js";
import type {
  LocalAgentSession,
  LocalRun,
  PersistedSession,
} from "../types/session.js";
import type { RunStreamEvent } from "../types/events.js";
import { sdkAuthOptions } from "../sdk-auth.js";
import { parseModelSelection, toSdkModel } from "../utils/model.js";

export function trimRunEvents(events: RunStreamEvent[]): RunStreamEvent[] {
  if (events.length <= MAX_EVENTS_PER_RUN) return events;
  const keep = events.slice(-MAX_EVENTS_PER_RUN);
  const dropped = events.slice(0, events.length - MAX_EVENTS_PER_RUN);
  const essentials = dropped.filter(
    (e) =>
      e.event === "user" ||
      e.event === "result" ||
      e.event === "done" ||
      e.event === "error",
  );
  const seen = new Set<string>();
  const merged: RunStreamEvent[] = [];
  for (const e of [...essentials, ...keep]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    merged.push(e);
  }
  return merged.length > MAX_EVENTS_PER_RUN
    ? merged.slice(-MAX_EVENTS_PER_RUN)
    : merged;
}

export class SessionRepository {
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private config: SidecarConfig,
    private sessions: Map<string, LocalAgentSession>,
  ) {}

  persistNow(): void {
    try {
      mkdirSync(this.config.stateDir, { recursive: true });
      const items: PersistedSession[] = [...this.sessions.values()]
        .filter((s) => s.status === "ACTIVE")
        .map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          cwd: s.cwd,
          model: s.model.id,
          modelParams: s.model.params,
          mode: s.mode,
          sdkAgentId: s.sdkAgentId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          latestRunId: s.latestRunId,
          unread: s.unread,
          pendingQueue: s.pendingQueue,
          runs: [...s.runs.values()].map((r) => {
            const events = trimRunEvents(r.events);
            if (events !== r.events) r.events = events;
            return {
              id: r.id,
              agentId: r.agentId,
              status: r.status,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              durationMs: r.durationMs,
              result: r.result,
              prompt: r.prompt,
              events,
            };
          }),
        }));
      writeFileSync(
        this.config.stateFile,
        JSON.stringify(items, null, 2),
        "utf8",
      );
    } catch (err) {
      console.warn("[sidecar] persistSessions failed", err);
    }
  }

  schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 400);
    this.persistTimer.unref?.();
  }

  async restore(): Promise<void> {
    if (!existsSync(this.config.stateFile)) return;
    try {
      const raw: unknown = JSON.parse(
        readFileSync(this.config.stateFile, "utf8"),
      );
      const entries: PersistedSession[] = Array.isArray(raw)
        ? (raw as PersistedSession[])
        : ((raw as { sessions?: PersistedSession[] }).sessions ?? []);

      for (const entry of entries) {
        if (entry.status !== "ACTIVE" || !entry.sdkAgentId) continue;
        try {
          const mode = entry.mode === "plan" ? "plan" : "agent";
          const model = parseModelSelection(
            { id: entry.model, params: entry.modelParams },
            this.config.defaultModel,
          );
          const cwd = resolve(String(entry.cwd ?? this.config.defaultCwd));
          const agent = await Agent.resume(entry.sdkAgentId, {
            ...sdkAuthOptions(this.config),
            model: toSdkModel(model),
            local: { cwd },
            mode,
          });
          const runs = new Map<string, LocalRun>();
          for (const r of entry.runs ?? []) {
            const events = Array.isArray(r.events)
              ? trimRunEvents(r.events)
              : [];
            let status = r.status;
            if (status === "CREATING" || status === "RUNNING") {
              status = "ERROR";
              if (!r.result) {
                r.result = "Sidecar restarted while run was in progress";
              }
            }
            runs.set(r.id, {
              id: r.id,
              agentId: r.agentId,
              status,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              durationMs: r.durationMs,
              result: r.result,
              prompt: r.prompt,
              events,
            });
          }
          const session: LocalAgentSession = {
            id: entry.id,
            name: entry.name,
            status: "ACTIVE",
            cwd,
            model,
            mode,
            sdkAgentId: entry.sdkAgentId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            latestRunId: entry.latestRunId,
            unread: Boolean(entry.unread),
            agent,
            runs,
            pendingQueue: Array.isArray(entry.pendingQueue)
              ? entry.pendingQueue
              : [],
          };
          this.sessions.set(session.id, session);
          console.log(
            `[sidecar] restored session ${session.id} (sdk=${session.sdkAgentId})`,
          );
        } catch (err) {
          console.warn(`[sidecar] restore failed for ${entry.id}:`, err);
        }
      }
    } catch (err) {
      console.warn("[sidecar] restoreSessions failed", err);
    }
  }
}
