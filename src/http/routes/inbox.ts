import express from "express";
import type { SidecarContext } from "../../sidecar-context.js";
import { setupSse, writeSseEvent } from "../sse.js";

export function createInboxRouter(ctx: SidecarContext) {
  const router = express.Router();
  const { inbox, sessions } = ctx;

  router.get("/stream", (req, res) => {
    const flush = setupSse(res);
    let closed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;

    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      unsubscribe?.();
      if (!res.writableEnded) res.end();
    };

    const write = (event: string, data: unknown) => {
      if (closed) return;
      writeSseEvent(res, flush, { event, data });
    };

    unsubscribe = inbox.subscribe(write);
    inbox.snapshot(sessions);

    timer = setInterval(() => {
      if (!closed) {
        writeSseEvent(res, flush, { event: "heartbeat", data: {} });
      }
    }, 10000);

    req.on("close", () => {
      close();
    });
  });

  return router;
}
