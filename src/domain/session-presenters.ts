import type { LocalAgentSession } from "../types/session.js";
import { isActiveSidecarRun } from "./run-status.js";
import { coalesceRunEvents } from "./transcript-service.js";

export function buildTranscript(session: LocalAgentSession) {
  const runs = [...session.runs.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  const lines = runs.flatMap((run) => coalesceRunEvents(run));
  const active = [...session.runs.values()]
    .filter((r) => isActiveSidecarRun(r.status))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  return {
    agentId: session.id,
    lines,
    activeRunId: active?.id ?? null,
    lastEventId: active?.events.length
      ? active.events[active.events.length - 1]!.id
      : null,
    pendingQueue: session.pendingQueue,
    model: session.model,
    mode: session.mode,
    source: "events" as const,
  };
}

export function toRun(r: {
  id: string;
  agentId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  durationMs?: number;
  result?: string;
  prompt?: string;
}) {
  return {
    id: r.id,
    agentId: r.agentId,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    durationMs: r.durationMs,
    result: r.result,
    prompt: r.prompt,
  };
}

export function toSummary(s: LocalAgentSession) {
  const latest = s.latestRunId ? s.runs.get(s.latestRunId) : undefined;
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    runStatus: latest?.status ?? null,
    unread: s.unread,
    env: { type: "local", name: s.cwd },
    url: `sidecar://agents/${s.id}`,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    latestRunId: s.latestRunId,
  };
}
