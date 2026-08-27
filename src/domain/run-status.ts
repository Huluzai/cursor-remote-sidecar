import type { RunStatus } from "../types/events.js";

export function normalizeCloudStatus(raw: unknown): RunStatus | null {
  const upper = String(raw ?? "").trim().toUpperCase();
  switch (upper) {
    case "CREATING":
    case "RUNNING":
    case "FINISHED":
    case "ERROR":
    case "CANCELLED":
    case "EXPIRED":
      return upper;
    default:
      break;
  }
  switch (String(raw ?? "").trim().toLowerCase()) {
    case "running":
      return "RUNNING";
    case "finished":
      return "FINISHED";
    case "error":
      return "ERROR";
    case "cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

export function isTerminalStatus(status: RunStatus): boolean {
  return (
    status === "FINISHED" ||
    status === "ERROR" ||
    status === "CANCELLED" ||
    status === "EXPIRED"
  );
}

/** Rank for forward-only status transitions (ignore regressions like CREATING after RUNNING). */
export function statusRank(status: RunStatus): number {
  switch (status) {
    case "CREATING":
      return 1;
    case "RUNNING":
      return 2;
    case "FINISHED":
    case "ERROR":
    case "CANCELLED":
    case "EXPIRED":
      return 3;
  }
}

export function isActiveSidecarRun(status: RunStatus): boolean {
  return status === "CREATING" || status === "RUNNING";
}

export function extractRunErrorMessage(
  result: {
    result?: unknown;
    error?: { message?: string; code?: string } | string | null;
  },
  fallbackText: string,
): string {
  if (typeof result.result === "string" && result.result.trim()) {
    return result.result.trim();
  }
  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim();
  }
  if (
    result.error &&
    typeof result.error === "object" &&
    typeof result.error.message === "string"
  ) {
    const msg = result.error.message.trim();
    if (msg) return msg;
  }
  if (fallbackText.trim()) return fallbackText.trim();
  return "任务执行失败（未返回详细错误）";
}

/** Matches Cursor SDK stale in-process token / ERROR_NOT_LOGGED_IN copy. */
export function isSdkAuthStaleMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("authentication error") ||
    m.includes("error_not_logged_in") ||
    m.includes("not_logged_in") ||
    m.includes("try logging out and back in") ||
    (m.includes("unauthenticated") && m.includes("auth"))
  );
}
