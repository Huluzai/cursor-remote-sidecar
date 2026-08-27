import { MAX_EVENTS_PER_RUN } from "../config.js";
import type { LocalAgentSession, LocalRun } from "../types/session.js";
import type { RunStreamEvent } from "../types/events.js";
import type { InboxHub } from "../domain/inbox-hub.js";
import type { SessionRepository } from "../infra/session-repository.js";
import { nowIso } from "../utils/time.js";

export type PushEventFn = (
  run: LocalRun,
  event: string,
  data: unknown,
) => string;

export function createEventBus(deps: {
  sessions: Map<string, LocalAgentSession>;
  inbox: InboxHub;
  sessionRepo: SessionRepository;
  trimRunEvents: (events: RunStreamEvent[]) => RunStreamEvent[];
}): {
  pushEvent: PushEventFn;
  clearSessionUnread: (session: LocalAgentSession) => void;
  markSessionUnread: (session: LocalAgentSession) => void;
} {
  const { sessions, inbox, sessionRepo, trimRunEvents } = deps;

  const clearSessionUnread = (session: LocalAgentSession) => {
    if (!session.unread) return;
    session.unread = false;
    session.updatedAt = nowIso();
    sessionRepo.schedulePersist();
    inbox.broadcastAgent(session);
  };

  const markSessionUnread = (session: LocalAgentSession) => {
    if (session.unread) return;
    session.unread = true;
    session.updatedAt = nowIso();
    sessionRepo.schedulePersist();
    inbox.broadcastAgent(session);
  };

  const pushEvent: PushEventFn = (run, event, data) => {
    const id = `${Date.now()}-${run.events.length}`;
    const entry: RunStreamEvent = { id, event, data };
    run.events.push(entry);
    if (run.events.length > MAX_EVENTS_PER_RUN) {
      run.events = trimRunEvents(run.events);
    }
    run.updatedAt = nowIso();
    run.streamWriters?.forEach((write) => write(entry));

    const session = sessions.get(run.agentId);
    if (session) {
      const hasSubscribers = (run.streamWriters?.size ?? 0) > 0;
      if (!hasSubscribers) {
        markSessionUnread(session);
      }
      if (
        event === "status" ||
        event === "result" ||
        event === "done" ||
        event === "error"
      ) {
        inbox.broadcastAgent(session);
      }
    }

    sessionRepo.schedulePersist();
    return id;
  };

  return { pushEvent, clearSessionUnread, markSessionUnread };
}
