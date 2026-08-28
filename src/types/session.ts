import type { Run } from "@cursor/sdk";
import type { Agent } from "@cursor/sdk";
import type { RunStatus, RunStreamEvent, RunStreamWriter } from "./events.js";

export interface ModelParam {
  id: string;
  value: string;
}

export interface ModelSelection {
  id: string;
  params?: ModelParam[];
}

export interface LocalRun {
  id: string;
  agentId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  durationMs?: number;
  result?: string;
  prompt?: string;
  events: RunStreamEvent[];
  streamWriters?: Set<RunStreamWriter>;
  cancel?: () => Promise<void>;
}

export interface QueuedPromptItem {
  id: string;
  text: string;
  mode: string;
  modelId: string;
  modelParams?: ModelParam[];
}

export type SidecarAgent = Awaited<ReturnType<typeof Agent.create>>;

export interface LocalAgentSession {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  cwd: string;
  model: ModelSelection;
  mode: "agent" | "plan";
  sdkAgentId: string;
  createdAt: string;
  updatedAt: string;
  latestRunId?: string;
  unread: boolean;
  agent: SidecarAgent | null;
  runs: Map<string, LocalRun>;
  pendingQueue: QueuedPromptItem[];
  inflight?: Promise<void>;
  currentSdkRun?: Run | null;
}

export interface PersistedRun {
  id: string;
  agentId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  durationMs?: number;
  result?: string;
  prompt?: string;
  events?: RunStreamEvent[];
}

export interface PersistedSession {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  cwd: string;
  model: string;
  modelParams?: ModelParam[];
  mode: "agent" | "plan";
  sdkAgentId: string;
  createdAt: string;
  updatedAt: string;
  latestRunId?: string;
  unread?: boolean;
  runs: PersistedRun[];
  pendingQueue?: QueuedPromptItem[];
}
