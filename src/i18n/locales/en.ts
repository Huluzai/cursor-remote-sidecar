export const en = {
  "startup.running": "Cursor Remote sidecar (Path C) is running",
  "startup.cursorLoggedInWithEmail": "  Cursor:  logged in ({email})",
  "startup.cursorLoggedIn": "  Cursor:  logged in",
  "startup.bind": "  bind:    {url}",
  "startup.cwd": "  cwd:     {path}",
  "startup.model": "  model:   {model}",
  "startup.pairingCode": "  pairing: {token}",
  "startup.pairingCodePersisted":
    "  Pairing code saved; iOS need not re-enter after process recycle",
  "startup.recycleEvery":
    "  recycle: every {minutes} min (SIDECAR_RECYCLE_MS)",
  "startup.recycleOff":
    "  recycle: timer off (auth-stale may still exit 75)",
  "startup.connectFromIos": "Connect from iOS (same Wi‑Fi or Tailscale):",
  "startup.host": "  host: {host}",
  "startup.port": "  port: {port}",
  "startup.orScanQr":
    "  Or scan the QR / enter the pairing code on the iOS App login screen",
  "startup.health": "Health: GET /health (no auth)",
  "startup.shuttingDown": "Shutting down sidecar…",

  "pairing.scanQr": "Scan this QR with iPhone to pair (Path C)",
  "pairing.qrHostPort": "  QR host: {host}  port: {port}",
  "pairing.otherHosts": "  Other hosts (enter manually if scan fails):",

  "auth.loginPrompt": "Sign in with your Cursor account in the browser…",
  "auth.openUrl": "If the browser did not open, visit:\n  {url}",
  "auth.loginFailed": "Login failed: {message}",
  "auth.loginRequired":
    "Please sign in with your Cursor account in the browser and try again.",
} as const;

export type MessageKey = keyof typeof en;
