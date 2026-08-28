import { resolve } from "node:path";

export function isPathAllowed(
  target: string,
  homeDir: string,
  defaultCwd: string,
): boolean {
  const resolved = resolve(target);
  if (resolved === homeDir || resolved.startsWith(homeDir + "/")) return true;
  if (resolved === defaultCwd || resolved.startsWith(defaultCwd + "/"))
    return true;
  return false;
}

/** `~`, `home`, and `~/…` map to the Mac home directory; empty uses defaultCwd. */
export function resolveFolderListPath(
  raw: unknown,
  homeDir: string,
  defaultCwd: string,
): string {
  if (typeof raw !== "string" || !raw.trim()) return resolve(defaultCwd);
  const trimmed = raw.trim();
  if (trimmed === "~" || trimmed.toLowerCase() === "home") {
    return resolve(homeDir);
  }
  if (trimmed.startsWith("~/")) {
    return resolve(homeDir, trimmed.slice(2));
  }
  return resolve(trimmed);
}

export function folderParentIfAllowed(
  base: string,
  homeDir: string,
  defaultCwd: string,
): string | null {
  const parent = resolve(base, "..");
  if (parent === base) return null;
  if (!isPathAllowed(parent, homeDir, defaultCwd)) return null;
  return parent;
}
