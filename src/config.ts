import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const MAX_EVENTS_PER_RUN = 2000;
export const PERSIST_DEBOUNCE_MS = 400;
export const EXIT_RECYCLE = 75;

const PAIRING_TOKEN_FILE = "pairing-token";

export interface SidecarConfig {
  port: number;
  host: string;
  defaultCwd: string;
  defaultModel: string;
  homeDir: string;
  /** Dev-only shortcut via env; omit to use SDK stored browser login. */
  apiKey?: string;
  cursorEmail?: string;
  pairingToken: string;
  /** True when pairing token was loaded or saved under stateDir (not SIDECAR_TOKEN). */
  pairingTokenPersisted: boolean;
  recycleMs: number;
  retryInterrupted: boolean;
  stateDir: string;
  stateFile: string;
}

function loadOrCreatePairingToken(
  stateDir: string,
  envTokenOverride?: string,
): {
  token: string;
  persisted: boolean;
} {
  const envToken =
    envTokenOverride !== undefined
      ? envTokenOverride.trim()
      : (process.env.SIDECAR_TOKEN?.trim() ?? "");
  if (envToken) {
    return { token: envToken, persisted: false };
  }

  const tokenFile = resolve(stateDir, PAIRING_TOKEN_FILE);
  if (existsSync(tokenFile)) {
    const token = readFileSync(tokenFile, "utf8").trim();
    if (/^\d{6}$/.test(token)) {
      return { token, persisted: true };
    }
  }

  const token = String(randomInt(100_000, 1_000_000));
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(tokenFile, token, "utf8");
  return { token, persisted: true };
}

/** Default browse/create cwd: `SIDECAR_CWD` if set, otherwise the user home directory. */
export function resolveDefaultCwd(
  envCwd: string | undefined,
  home: string,
): string {
  const trimmed = envCwd?.trim();
  return resolve(trimmed ? trimmed : home);
}

export function loadConfig(auth?: {
  apiKey?: string;
  email?: string;
}): SidecarConfig {
  const stateDir = resolve(homedir(), ".cursor-remote-sidecar");
  const { token, persisted } = loadOrCreatePairingToken(stateDir);

  const homeDir = resolve(homedir());
  return {
    port: Number(process.env.SIDECAR_PORT ?? 8787),
    host: process.env.SIDECAR_HOST ?? "0.0.0.0",
    defaultCwd: resolveDefaultCwd(process.env.SIDECAR_CWD, homeDir),
    defaultModel: process.env.SIDECAR_MODEL ?? "composer-2.5",
    homeDir,
    apiKey: auth?.apiKey,
    cursorEmail: auth?.email,
    pairingToken: token,
    pairingTokenPersisted: persisted,
    recycleMs: Number(process.env.SIDECAR_RECYCLE_MS ?? 50 * 60 * 1000),
    retryInterrupted: process.env.SIDECAR_RETRY_INTERRUPTED === "1",
    stateDir,
    stateFile: resolve(stateDir, "sessions.json"),
  };
}

/** @internal exported for tests */
export function loadOrCreatePairingTokenForTest(
  stateDir: string,
  envToken?: string,
): { token: string; persisted: boolean } {
  return loadOrCreatePairingToken(stateDir, envToken ?? "");
}
