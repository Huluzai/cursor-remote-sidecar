#!/usr/bin/env node
/**
 * Supervisor for the Path C sidecar.
 *
 * The Cursor SDK caches a short-lived access token in the Node process.
 * After ~1h idle that token goes stale and only a full process restart
 * re-exchanges credentials. The sidecar exits with code 75 when it
 * wants a recycle; this script respawns it.
 *
 * Usage:
 *   npm start
 *   # or: node scripts/supervise.mjs
 *
 * Pairing code is persisted under ~/.cursor-remote-sidecar/ by default.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EXIT_RECYCLE = 75;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHILD_SCRIPT = join(ROOT, "dist", "index.js");

let child = null;
let stopping = false;
let generation = 0;

function start() {
  generation += 1;
  const gen = generation;
  console.log(`[supervise] starting sidecar (gen=${gen})`);
  child = spawn(process.execPath, [CHILD_SCRIPT], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (gen !== generation) return;
    child = null;
    if (stopping) {
      process.exit(code ?? (signal ? 1 : 0));
      return;
    }
    if (code === 0) {
      console.log("[supervise] sidecar exited cleanly; not restarting");
      process.exit(0);
      return;
    }
    const reason =
      code === EXIT_RECYCLE
        ? "recycle (SDK token refresh)"
        : `exit code=${code} signal=${signal ?? "-"}`;
    console.warn(`[supervise] child stopped: ${reason}; restarting in 1s…`);
    setTimeout(start, 1000);
  });
}

function forward(sig) {
  stopping = true;
  if (child && !child.killed) {
    child.kill(sig);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

start();
