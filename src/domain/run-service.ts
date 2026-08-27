import { CursorAgentError, type Run } from "@cursor/sdk";
import type { SidecarConfig } from "../config.js";
import type {
  LocalAgentSession,
  LocalRun,
  ModelSelection,
} from "../types/session.js";
import { RunEventPipeline } from "./run-event-pipeline.js";
import type { PushEventFn } from "./run-event-bus.js";
import {
  extractRunErrorMessage,
  isActiveSidecarRun,
  isSdkAuthStaleMessage,
  isTerminalStatus,
  normalizeCloudStatus,
  statusRank,
} from "./run-status.js";
import {
  clearSdkActiveRuns,
  isBusyError,
  isStreamClosedError,
  logAgentArtifacts,
  settleSdkRun,
} from "../infra/cursor-sdk-adapter.js";
import { toSdkModel } from "../utils/model.js";
import { nowIso } from "../utils/time.js";
import type { RecycleManager } from "../infra/recycle-manager.js";
import type { SessionRepository } from "../infra/session-repository.js";

export type RunServiceDeps = {
  config: SidecarConfig;
  pushEvent: PushEventFn;
  sessionRepo: SessionRepository;
  recycleManager: RecycleManager;
  onRunSettled: (session: LocalAgentSession) => void;
};

export class RunService {
  constructor(private deps: RunServiceDeps) {}

  sessionIsBusy(session: LocalAgentSession): boolean {
    return this.deps.recycleManager.sessionIsBusy(session);
  }

  async executeRun(
    session: LocalAgentSession,
    run: LocalRun,
    prompt: string,
    opts?: { mode?: "agent" | "plan"; model?: ModelSelection },
  ): Promise<void> {
    let releaseInflight!: () => void;
    const inflightPromise = new Promise<void>((resolve) => {
      releaseInflight = resolve;
    });
    session.inflight = inflightPromise;

    const started = Date.now();
    run.status = "RUNNING";
    if (prompt.trim()) {
      run.prompt = prompt;
      this.deps.pushEvent(run, "user", { text: prompt });
    }
    this.deps.pushEvent(run, "status", { runId: run.id, status: "RUNNING" });

    let aborted = false;
    let activeRun: Run | null = null;
    const pipeline = new RunEventPipeline();

    run.cancel = async () => {
      aborted = true;
      if (activeRun && activeRun.supports("cancel")) {
        await activeRun.cancel();
      } else if (
        session.currentSdkRun &&
        session.currentSdkRun.supports("cancel")
      ) {
        await session.currentSdkRun.cancel();
      }
    };

    const emitPipeline = (events: ReturnType<RunEventPipeline["ingestDelta"]>) => {
      for (const ev of events) {
        if (ev.type === "tool_call") {
          this.deps.pushEvent(run, "tool_call", ev.payload);
        } else {
          this.deps.pushEvent(run, ev.type, { text: ev.text });
        }
      }
    };

    const mode = opts?.mode ?? session.mode ?? "agent";
    if (opts?.model) {
      session.model = opts.model;
    }
    const activeModel = session.model;

    // Never throw into SDK callbacks — that can close the write stream and
    // surface as WriteIterableClosedError on a later tick.
    const sendOptions = {
      onDelta: ({
        update,
      }: {
        update: {
          type: string;
          text?: string;
          callId?: string;
          toolCall?: { type?: string; args?: unknown; result?: unknown };
        };
      }) => {
        try {
          if (aborted) return;
          emitPipeline(pipeline.ingestDelta(update));
        } catch (err) {
          console.warn("[sidecar] onDelta handler error", err);
        }
      },
      onStep: ({
        step,
      }: {
        step: { type: string; message?: { text?: string; type?: string } };
      }) => {
        try {
          if (aborted) return;
          emitPipeline(pipeline.ingestStep(step));
        } catch (err) {
          console.warn("[sidecar] onStep handler error", err);
        }
      },
    };

    try {
      const trySend = async () =>
        session.agent.send(prompt, {
          ...sendOptions,
          mode,
          model: toSdkModel(activeModel),
        } as Parameters<typeof session.agent.send>[1]);

      try {
        activeRun = await trySend();
      } catch (err) {
        if (!isBusyError(err)) throw err;
        console.warn(
          "[sidecar] agent busy on send — clearing SDK runs and retrying once",
        );
        await clearSdkActiveRuns(session);
        if (aborted) throw err;
        activeRun = await trySend();
      }

      session.currentSdkRun = activeRun;

      if (aborted) {
        await settleSdkRun(activeRun);
        session.currentSdkRun = null;
        run.status = "CANCELLED";
        run.durationMs = Date.now() - started;
        this.deps.pushEvent(run, "result", {
          runId: run.id,
          status: "CANCELLED",
          durationMs: run.durationMs,
        });
        return;
      }

      const streamDrain = (async () => {
        try {
          for await (const event of activeRun!.stream()) {
            if (aborted) break;
            if (event.type === "assistant") {
              const text = event.message.content
                .filter(
                  (b): b is { type: "text"; text: string } => b.type === "text",
                )
                .map((b) => b.text)
                .join("");
              emitPipeline(pipeline.ingestStreamAssistant(text));
            } else if (event.type === "thinking") {
              emitPipeline(pipeline.ingestStreamThinking(event.text ?? ""));
            } else if (event.type === "tool_call") {
              emitPipeline(
                pipeline.ingestStreamTool({
                  callId: event.call_id,
                  name: event.name,
                  status: event.status,
                  args: event.args,
                  result: event.result,
                }),
              );
            } else if (event.type === "status") {
              const mapped = normalizeCloudStatus(event.status);
              if (!mapped) continue;
              if (isTerminalStatus(run.status)) continue;
              if (mapped === run.status) continue;
              if (statusRank(mapped) < statusRank(run.status)) continue;
              run.status = mapped;
              this.deps.pushEvent(run, "status", {
                runId: run.id,
                status: mapped,
              });
            }
          }
        } catch (err) {
          if (aborted || isStreamClosedError(err)) {
            if (isStreamClosedError(err)) {
              console.warn(
                "[sidecar] stream() closed (WriteIterableClosedError) — treating as teardown",
              );
            }
            return;
          }
          console.warn("[sidecar] stream() drain error", err);
        }
      })();

      const result = await activeRun.wait();
      await streamDrain;
      if (session.currentSdkRun === activeRun) session.currentSdkRun = null;
      run.durationMs = Date.now() - started;
      const status = String(result.status);
      const deltaAssistant = pipeline.getAssistantText();

      if (aborted || status === "cancelled") {
        run.status = "CANCELLED";
        this.deps.pushEvent(run, "result", {
          runId: run.id,
          status: "CANCELLED",
          durationMs: run.durationMs,
        });
      } else if (status === "error") {
        run.status = "ERROR";
        const message = extractRunErrorMessage(result, deltaAssistant);
        run.result = message;
        console.error("[sidecar] run ended with error", {
          runId: run.id,
          agentId: session.id,
          code:
            typeof result.error === "object" ? result.error?.code : undefined,
          message,
          rawResult: result.result,
          rawError: result.error,
        });
        this.deps.pushEvent(run, "error", {
          code:
            (typeof result.error === "object" && result.error?.code) ||
            "run_failed",
          message,
        });
        this.deps.pushEvent(run, "result", {
          runId: run.id,
          status: "ERROR",
          text: message,
          durationMs: run.durationMs,
        });
        if (isSdkAuthStaleMessage(message)) {
          this.deps.recycleManager.request(
            `sdk auth stale after run ${run.id}`,
          );
        }
      } else {
        run.status = "FINISHED";
        run.result =
          typeof result.result === "string" ? result.result : undefined;
        if (!run.result) {
          run.result = run.events
            .filter((e) => e.event === "assistant")
            .map((e) => (e.data as { text?: string }).text ?? "")
            .join("");
        }
        this.deps.pushEvent(run, "result", {
          runId: run.id,
          status: "FINISHED",
          text: run.result,
          durationMs: run.durationMs,
        });
      }
    } catch (err) {
      run.durationMs = Date.now() - started;
      if (session.currentSdkRun === activeRun) session.currentSdkRun = null;
      if (aborted) {
        run.status = "CANCELLED";
        this.deps.pushEvent(run, "result", {
          runId: run.id,
          status: "CANCELLED",
          durationMs: run.durationMs,
        });
      } else {
        run.status = "ERROR";
        const message = isStreamClosedError(err)
          ? "SDK 流已关闭（会话可能过期，请重试或新建会话）"
          : err instanceof CursorAgentError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        run.result = message;
        const code = isBusyError(err)
          ? "agent_busy"
          : isStreamClosedError(err)
            ? "stream_closed"
            : "run_failed";
        this.deps.pushEvent(run, "error", { code, message });
        this.deps.pushEvent(run, "result", {
          runId: run.id,
          status: "ERROR",
          text: message,
          durationMs: run.durationMs,
        });
        if (isSdkAuthStaleMessage(message)) {
          this.deps.recycleManager.request(
            `sdk auth stale (throw) after run ${run.id}`,
          );
        }
      }
    } finally {
      await logAgentArtifacts(session, run.id);
      this.deps.pushEvent(run, "done", {});
      run.updatedAt = nowIso();
      session.updatedAt = nowIso();
      run.cancel = undefined;
      releaseInflight();
      if (session.inflight === inflightPromise) {
        session.inflight = undefined;
      }
      this.deps.sessionRepo.persistNow();
      this.deps.onRunSettled(session);
    }
  }

  async cancelRun(
    session: LocalAgentSession,
    run: LocalRun,
  ): Promise<void> {
    const inflight = session.inflight;
    try {
      await run.cancel?.();
    } catch (err) {
      console.warn("[sidecar] cancel handler error", err);
    }
    if (inflight) {
      await inflight.catch(() => {});
    } else {
      await clearSdkActiveRuns(session);
    }
    if (isActiveSidecarRun(run.status)) {
      run.status = "CANCELLED";
      this.deps.pushEvent(run, "result", {
        runId: run.id,
        status: "CANCELLED",
      });
      this.deps.pushEvent(run, "done", {});
    }
  }
}
