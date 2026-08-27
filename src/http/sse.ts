import type { Response } from "express";

export function setupSse(res: Response): () => void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();

  return () => {
    const maybeFlush = (res as Response & { flush?: () => void }).flush;
    maybeFlush?.();
  };
}

export function writeSseEvent(
  res: Response,
  flush: () => void,
  opts: { id?: string; event: string; data: unknown },
): void {
  if (opts.id) res.write(`id: ${opts.id}\n`);
  res.write(`event: ${opts.event}\n`);
  res.write(`data: ${JSON.stringify(opts.data)}\n\n`);
  flush();
}
