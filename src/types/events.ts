export type RunStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "ERROR"
  | "CANCELLED"
  | "EXPIRED";

export type RunStreamEvent = { id: string; event: string; data: unknown };
export type RunStreamWriter = (event: RunStreamEvent) => void;
