#!/usr/bin/env node
import { resolveCursorAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { createSidecarContext } from "./sidecar-context.js";
import { createApp } from "./http/app.js";
import { isStreamClosedError } from "./infra/cursor-sdk-adapter.js";
import { printPairingQR } from "./pairing-qr.js";
import { localAddresses } from "./utils/network.js";

const auth = await resolveCursorAuth();
const config = loadConfig({
  apiKey: auth.apiKey,
  email: auth.email,
});
const ctx = createSidecarContext(config);

await ctx.sessionRepo.restore();

// Drain queued prompts for restored sessions (e.g. after process recycle).
for (const session of ctx.sessions.values()) {
  if (
    session.pendingQueue.length > 0 &&
    !ctx.runService.sessionIsBusy(session)
  ) {
    ctx.queueService.drain(session);
  }
}

const app = createApp(ctx);

app.listen(config.port, config.host, () => {
  const addrs = localAddresses();
  console.log("");
  console.log("Cursor Remote sidecar (Path C) is running");
  if (config.cursorEmail) {
    console.log(`  Cursor:  已登录 (${config.cursorEmail})`);
  } else {
    console.log("  Cursor:  已登录");
  }
  console.log(`  bind:    http://${config.host}:${config.port}`);
  console.log(`  cwd:     ${config.defaultCwd}`);
  console.log(`  model:   ${config.defaultModel}`);
  console.log(`  配对码:  ${config.pairingToken}`);
  if (config.pairingTokenPersisted) {
    console.log("  配对码已保存，进程回收后无需在 iOS 重填");
  }
  if (config.recycleMs > 0) {
    console.log(
      `  recycle: every ${Math.round(config.recycleMs / 60_000)} min (SIDECAR_RECYCLE_MS)`,
    );
  } else {
    console.log("  recycle: timer off (auth-stale may still exit 75)");
  }
  console.log("");
  console.log("Connect from iOS (same Wi‑Fi or Tailscale):");
  const hosts = addrs.length ? addrs : ["127.0.0.1"];
  for (const ip of hosts) {
    console.log(`  host: ${ip}`);
    console.log(`  port: ${config.port}`);
  }
  printPairingQR("", config.port, config.pairingToken, hosts);
  console.log("  或在 iOS App 登录页扫描二维码 / 手动输入配对码");
  console.log("");
  console.log("Health: GET /health (no auth)");
});

ctx.recycleManager.scheduleTimer();

async function shutdown() {
  console.log("Shutting down sidecar…");
  for (const s of ctx.sessions.values()) {
    try {
      await s.agent[Symbol.asyncDispose]();
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

// @cursor/sdk can reject after cancel/dispose with WriteIterableClosedError on a
// detached tick. Node 24 defaults to --unhandled-rejections=throw → process exit 1.
process.on("unhandledRejection", (reason) => {
  if (isStreamClosedError(reason)) {
    console.warn(
      "[sidecar] ignored WriteIterableClosedError (SDK stream already closed)",
    );
    return;
  }
  console.error("[sidecar] unhandledRejection", reason);
});

process.on("uncaughtException", (err) => {
  if (isStreamClosedError(err)) {
    console.warn(
      "[sidecar] ignored WriteIterableClosedError (SDK stream already closed)",
    );
    return;
  }
  console.error("[sidecar] uncaughtException", err);
  process.exit(1);
});
