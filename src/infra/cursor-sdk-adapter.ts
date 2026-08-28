import { Agent, AgentBusyError, type Run } from "@cursor/sdk";
import type { LocalAgentSession } from "../types/session.js";

/**
 * SDK internal stream teardown: write after close.
 * Often transient (cancel / dispose / long session); Node 24 turns
 * unhandled rejections into process crashes unless we catch them.
 */
export function isStreamClosedError(err: unknown): boolean {
  if (err && typeof err === "object" && "name" in err) {
    if (String((err as { name?: unknown }).name) === "WriteIterableClosedError") {
      return true;
    }
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /WritableIterable is closed|WriteIterableClosedError/i.test(message);
}

export function isBusyError(err: unknown): boolean {
  if (err instanceof AgentBusyError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /already has active run/i.test(message);
}

export async function settleSdkRun(run: Run | null | undefined): Promise<void> {
  if (!run) return;
  try {
    if (run.status === "running" && run.supports("cancel")) {
      await run.cancel();
    }
  } catch (err) {
    console.warn("[sidecar] sdk cancel failed", err);
  }
  try {
    await run.wait();
  } catch (err) {
    if (!isStreamClosedError(err)) {
      console.warn("[sidecar] sdk wait after cancel failed", err);
    }
  }
}

export async function clearSdkActiveRuns(
  session: LocalAgentSession,
): Promise<void> {
  const current = session.currentSdkRun;
  session.currentSdkRun = null;
  await settleSdkRun(current);

  if (!session.agent) return;

  try {
    const listed = await Agent.listRuns(session.agent.agentId, {
      runtime: "local",
      cwd: session.cwd,
    });
    for (const item of listed.items) {
      if (item.status !== "running") continue;
      try {
        if (item.supports("cancel")) await item.cancel();
      } catch {
        try {
          await Agent.cancelRun(item.id, {
            runtime: "local",
            cwd: session.cwd,
          });
        } catch (err) {
          console.warn("[sidecar] cancelRun orphan failed", item.id, err);
        }
      }
      try {
        await item.wait();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[sidecar] listRuns for idle recovery failed", err);
  }
}

export async function logAgentArtifacts(
  session: LocalAgentSession,
  runId: string,
): Promise<void> {
  if (!session.agent) return;
  try {
    const items = await session.agent.listArtifacts();
    console.log("[sidecar] artifacts after run", {
      runId,
      agentId: session.id,
      sdkAgentId: session.sdkAgentId,
      count: items.length,
      items: items.map((a) => ({
        path: a.path,
        sizeBytes: a.sizeBytes,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (err) {
    console.warn("[sidecar] listArtifacts failed", {
      runId,
      agentId: session.id,
      sdkAgentId: session.sdkAgentId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
