import type { MessageKey } from "./en.js";

export const zh: Record<MessageKey, string> = {
  "startup.running": "Cursor Remote sidecar (Path C) 已启动",
  "startup.cursorLoggedInWithEmail": "  Cursor:  已登录 ({email})",
  "startup.cursorLoggedIn": "  Cursor:  已登录",
  "startup.bind": "  bind:    {url}",
  "startup.cwd": "  cwd:     {path}",
  "startup.model": "  model:   {model}",
  "startup.pairingCode": "  配对码:  {token}",
  "startup.pairingCodePersisted":
    "  配对码已保存，进程回收后无需在 iOS 重填",
  "startup.recycleEvery":
    "  recycle: 每 {minutes} 分钟 (SIDECAR_RECYCLE_MS)",
  "startup.recycleOff":
    "  recycle: 定时关闭（鉴权过期仍可能 exit 75）",
  "startup.connectFromIos": "从 iOS 连接（同一 Wi‑Fi 或 Tailscale）：",
  "startup.host": "  host: {host}",
  "startup.port": "  port: {port}",
  "startup.orScanQr":
    "  或在 iOS App 登录页扫描二维码 / 手动输入配对码",
  "startup.health": "健康检查: GET /health（无需鉴权）",
  "startup.shuttingDown": "正在关闭 sidecar…",

  "pairing.scanQr": "用 iPhone 扫描下方二维码配对（Path C）",
  "pairing.qrHostPort": "  QR host: {host}  port: {port}",
  "pairing.otherHosts": "  其他可用 host（扫不上时可手输）:",

  "auth.loginPrompt": "请用 Cursor 账号在浏览器中完成登录…",
  "auth.openUrl": "若浏览器未自动打开，请访问：\n  {url}",
  "auth.loginFailed": "登录失败：{message}",
  "auth.loginRequired": "请用 Cursor 账号在浏览器完成登录后重试。",
};
