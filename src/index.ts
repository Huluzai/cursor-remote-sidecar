#!/usr/bin/env node
import { resolveCursorAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { createSidecarContext } from "./sidecar-context.js";
import { createApp } from "./http/app.js";
import { initLocale, t } from "./i18n/index.js";
import { isStreamClosedError } from "./infra/cursor-sdk-adapter.js";
import { printPairingQR } from "./pairing-qr.js";
import { localAddresses } from "./utils/network.js";

initLocale();

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
  console.log(t("startup.running"));
  if (config.cursorEmail) {
    console.log(
      t("startup.cursorLoggedInWithEmail", { email: config.cursorEmail }),
    );
  } else {
    console.log(t("startup.cursorLoggedIn"));
  }
  console.log(
    t("startup.bind", { url: `http://${config.host}:${config.port}` }),
  );
  console.log(t("startup.cwd", { path: config.defaultCwd }));
  console.log(t("startup.model", { model: config.defaultModel }));
  console.log(t("startup.pairingCode", { token: config.pairingToken }));
  if (config.pairingTokenPersisted) {
    console.log(t("startup.pairingCodePersisted"));
  }
  if (config.recycleMs > 0) {
    console.log(
      t("startup.recycleEvery", {
        minutes: Math.round(config.recycleMs / 60_000),
      }),
    );
  } else {
    console.log(t("startup.recycleOff"));
  }
  console.log("");
  console.log(t("startup.connectFromIos"));
  const hosts = addrs.length ? addrs : ["127.0.0.1"];
  for (const ip of hosts) {
    console.log(t("startup.host", { host: ip }));
    console.log(t("startup.port", { port: config.port }));
  }
  printPairingQR("", config.port, config.pairingToken, hosts);
  console.log(t("startup.orScanQr"));
  console.log("");
  console.log(t("startup.health"));
});

ctx.recycleManager.scheduleTimer();

async function shutdown() {
  console.log(t("startup.shuttingDown"));
  for (const s of ctx.sessions.values()) {
    if (!s.agent) continue;
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
