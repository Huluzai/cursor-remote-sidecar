import type { SidecarConfig } from "./config.js";
import type { LocalAgentSession } from "./types/session.js";
import { InboxHub } from "./domain/inbox-hub.js";
import { createEventBus } from "./domain/run-event-bus.js";
import { RunService } from "./domain/run-service.js";
import { QueueService } from "./domain/queue-service.js";
import { SessionRepository, trimRunEvents } from "./infra/session-repository.js";
import { RecycleManager } from "./infra/recycle-manager.js";

export interface SidecarContext {
  config: SidecarConfig;
  sessions: Map<string, LocalAgentSession>;
  inbox: InboxHub;
  sessionRepo: SessionRepository;
  recycleManager: RecycleManager;
  runService: RunService;
  queueService: QueueService;
  clearSessionUnread: (session: LocalAgentSession) => void;
}

export function createSidecarContext(config: SidecarConfig): SidecarContext {
  const sessions = new Map<string, LocalAgentSession>();
  const inbox = new InboxHub();
  const sessionRepo = new SessionRepository(config, sessions);
  const recycleManager = new RecycleManager(
    config,
    sessions,
    sessionRepo,
    inbox,
  );

  const { pushEvent, clearSessionUnread } = createEventBus({
    sessions,
    inbox,
    sessionRepo,
    trimRunEvents,
  });

  let queueService!: QueueService;

  const runService = new RunService({
    config,
    pushEvent,
    sessionRepo,
    recycleManager,
    onRunSettled: (session: LocalAgentSession) => {
      queueService.drain(session);
    },
  });

  queueService = new QueueService(sessionRepo, inbox, runService);

  return {
    config,
    sessions,
    inbox,
    sessionRepo,
    recycleManager,
    runService,
    queueService,
    clearSessionUnread,
  };
}
