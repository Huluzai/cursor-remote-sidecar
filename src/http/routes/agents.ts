import { resolve } from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import express from "express";
import { nanoid } from "nanoid";
import type { SidecarContext } from "../../sidecar-context.js";
import type { RunStreamEvent } from "../../types/events.js";
import type { LocalAgentSession } from "../../types/session.js";
import {
  buildTranscript,
  toRun,
  toSummary,
} from "../../domain/session-presenters.js";
import { sdkAuthOptions } from "../../sdk-auth.js";
import { parseModelSelection, toSdkModel } from "../../utils/model.js";
import { nowIso } from "../../utils/time.js";
import { setupSse, writeSseEvent } from "../sse.js";

export function createAgentsRouter(ctx: SidecarContext) {
  const router = express.Router();
  const {
    config,
    sessions,
    sessionRepo,
    inbox,
    runService,
    queueService,
    clearSessionUnread,
  } = ctx;

  router.get("/", (req, res) => {
    const includeArchived =
      String(req.query.includeArchived ?? "false") === "true";
    const items = [...sessions.values()]
      .filter((s) => includeArchived || s.status === "ACTIVE")
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(toSummary);
    res.json({ items });
  });

  router.get("/:id", (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    res.json({
      ...toSummary(s),
      repos: [],
      workOnCurrentBranch: true,
      autoCreatePR: false,
      model: s.model,
      mode: s.mode,
    });
  });

  router.get("/:id/transcript", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    clearSessionUnread(session);
    res.json(buildTranscript(session));
  });

  router.put("/:id/queue", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session || session.status !== "ACTIVE") {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    const body = req.body ?? {};
    const raw = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body)
        ? body
        : null;
    if (!raw) {
      res
        .status(400)
        .json({ error: "Bad Request", message: "items array required" });
      return;
    }
    const items = queueService.syncQueue(session, raw);
    if (!runService.sessionIsBusy(session)) {
      queueService.drain(session);
    }
    res.json({ items });
  });

  router.post("/", async (req, res) => {
    try {
      const body = req.body ?? {};
      const text = String(body?.prompt?.text ?? "").trim();
      if (!text) {
        res
          .status(400)
          .json({ error: "Bad Request", message: "prompt.text required" });
        return;
      }
      const cwd = resolve(String(body?.cwd ?? config.defaultCwd));
      const model = parseModelSelection(body?.model, config.defaultModel);
      const mode: "agent" | "plan" = body.mode === "plan" ? "plan" : "agent";
      const name = String(body?.name ?? text.slice(0, 48));

      const agent = await Agent.create({
        ...sdkAuthOptions(config),
        model: toSdkModel(model),
        local: { cwd },
        mode,
      });

      const id = `local-${nanoid(10)}`;
      const createdAt = nowIso();
      const session: LocalAgentSession = {
        id,
        name,
        status: "ACTIVE",
        cwd,
        model,
        mode,
        sdkAgentId: agent.agentId,
        createdAt,
        updatedAt: createdAt,
        unread: false,
        agent,
        runs: new Map(),
        pendingQueue: [],
      };
      sessions.set(id, session);

      const runId = `run-${nanoid(10)}`;
      const run = {
        id: runId,
        agentId: id,
        status: "CREATING" as const,
        createdAt,
        updatedAt: createdAt,
        prompt: text,
        events: [],
      };
      session.runs.set(runId, run);
      session.latestRunId = runId;

      sessionRepo.persistNow();
      inbox.broadcastAgent(session);
      void runService.executeRun(session, run, text, { mode, model });

      res.status(201).json({
        agent: {
          ...toSummary(session),
          repos: [],
          workOnCurrentBranch: true,
          autoCreatePR: false,
        },
        run: toRun(run),
      });
    } catch (err) {
      const message =
        err instanceof CursorAgentError
          ? `${err.message} (retryable=${err.isRetryable})`
          : err instanceof Error
            ? err.message
            : String(err);
      res.status(500).json({ error: "Internal Error", message });
    }
  });

  router.post("/:id/runs", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session || session.status !== "ACTIVE") {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    if (runService.sessionIsBusy(session)) {
      res.status(409).json({
        error: "agent_busy",
        message: "Agent already has an active run",
      });
      return;
    }
    const body = req.body ?? {};
    const text = String(body?.prompt?.text ?? "").trim();
    if (!text) {
      res
        .status(400)
        .json({ error: "Bad Request", message: "prompt.text required" });
      return;
    }

    if (body?.model?.id || body?.model?.params) {
      session.model = parseModelSelection(body.model, session.model.id);
    }
    if (body.mode === "agent" || body.mode === "plan") {
      session.mode = body.mode;
    }

    const runId = `run-${nanoid(10)}`;
    const createdAt = nowIso();
    const run = {
      id: runId,
      agentId: session.id,
      status: "CREATING" as const,
      createdAt,
      updatedAt: createdAt,
      prompt: text,
      events: [],
    };
    session.runs.set(runId, run);
    session.latestRunId = runId;
    session.updatedAt = createdAt;
    sessionRepo.persistNow();
    inbox.broadcastAgent(session);
    void runService.executeRun(session, run, text, {
      mode: session.mode,
      model: session.model,
    });
    res.status(201).json({ run: toRun(run) });
  });

  router.get("/:id/runs", (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    const items = [...session.runs.values()]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(toRun);
    res.json({ items });
  });

  router.get("/:id/runs/:runId", (req, res) => {
    const session = sessions.get(req.params.id);
    const run = session?.runs.get(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Not Found", message: "run_not_found" });
      return;
    }
    res.json(toRun(run));
  });

  router.get("/:id/runs/:runId/stream", (req, res) => {
    const session = sessions.get(req.params.id);
    const run = session?.runs.get(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Not Found", message: "run_not_found" });
      return;
    }

    const flush = setupSse(res);
    const lastEventId = req.header("last-event-id") ?? "";
    let resumeFrom = 0;
    if (lastEventId) {
      const found = run.events.findIndex((e: RunStreamEvent) => e.id === lastEventId);
      if (found >= 0) resumeFrom = found + 1;
    }

    let closed = false;
    const written = new Set<string>();
    let timer: ReturnType<typeof setInterval> | undefined;

    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      run.streamWriters?.delete(write);
      if (!res.writableEnded) res.end();
    };

    const write = (e: (typeof run.events)[number]) => {
      if (closed || written.has(e.id)) return;
      written.add(e.id);
      writeSseEvent(res, flush, { id: e.id, event: e.event, data: e.data });
      if (e.event === "done") close();
    };

    if (!run.streamWriters) run.streamWriters = new Set();
    run.streamWriters.add(write);
    if (session) clearSessionUnread(session);
    for (let i = 0; i < resumeFrom; i++) {
      written.add(run.events[i]!.id);
    }
    for (let i = resumeFrom; i < run.events.length; i++) {
      write(run.events[i]!);
    }

    if (["FINISHED", "ERROR", "CANCELLED", "EXPIRED"].includes(run.status)) {
      close();
      return;
    }

    timer = setInterval(() => {
      if (["FINISHED", "ERROR", "CANCELLED", "EXPIRED"].includes(run.status)) {
        close();
      } else if (!closed) {
        writeSseEvent(res, flush, { event: "heartbeat", data: {} });
      }
    }, 10000);

    req.on("close", () => {
      close();
    });
  });

  router.post("/:id/runs/:runId/cancel", async (req, res) => {
    const session = sessions.get(req.params.id);
    const run = session?.runs.get(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Not Found", message: "run_not_found" });
      return;
    }
    if (
      !["CREATING", "RUNNING"].includes(run.status) &&
      !session?.inflight
    ) {
      res
        .status(409)
        .json({ error: "run_not_cancellable", message: "Run is not active" });
      return;
    }
    if (session) {
      await runService.cancelRun(session, run);
    }
    res.json({ id: run.id });
  });

  router.get("/:id/artifacts", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    try {
      const items = await session.agent.listArtifacts();
      res.json({
        items: items.map((a) => ({
          path: a.path,
          sizeBytes: a.sizeBytes,
          updatedAt: a.updatedAt,
        })),
      });
    } catch (err) {
      console.warn("[sidecar] listArtifacts failed", err);
      res.json({ items: [] });
    }
  });

  router.post("/:id/archive", async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Not Found", message: "agent_not_found" });
      return;
    }
    session.status = "ARCHIVED";
    try {
      await session.agent[Symbol.asyncDispose]();
    } catch {
      // ignore dispose errors
    }
    inbox.broadcastAgent(session);
    sessionRepo.persistNow();
    res.json({ id: session.id });
  });

  return router;
}
