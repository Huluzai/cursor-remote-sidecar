import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isPathAllowed } from "./folders.js";

export type BrowseEntryKind = "file" | "folder";

export interface BrowseEntry {
  name: string;
  path: string;
  kind: BrowseEntryKind;
}

const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

export function shouldSkipEntryName(name: string): boolean {
  return name.startsWith(".");
}

export function listBrowseEntries(
  base: string,
  homeDir: string,
  defaultCwd: string,
  query?: string,
): BrowseEntry[] {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const entries: BrowseEntry[] = [];

  for (const dirent of readdirSync(base, { withFileTypes: true })) {
    if (shouldSkipEntryName(dirent.name)) continue;
    if (dirent.isDirectory() && SKIP_DIR_NAMES.has(dirent.name)) continue;

    const childPath = resolve(base, dirent.name);
    if (!isPathAllowed(childPath, homeDir, defaultCwd)) continue;

    const kind: BrowseEntryKind = dirent.isDirectory() ? "folder" : "file";
    if (!dirent.isDirectory() && !dirent.isFile()) continue;

    if (
      normalizedQuery &&
      !dirent.name.toLowerCase().includes(normalizedQuery)
    ) {
      continue;
    }

    entries.push({ name: dirent.name, path: childPath, kind });
  }

  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function searchBrowseEntriesRecursive(
  root: string,
  homeDir: string,
  defaultCwd: string,
  query: string,
  options: { maxDepth?: number; maxResults?: number } = {},
): BrowseEntry[] {
  const maxDepth = options.maxDepth ?? 8;
  const maxResults = options.maxResults ?? 50;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const results: BrowseEntry[] = [];

  function walk(dir: string, depth: number): void {
    if (results.length >= maxResults || depth > maxDepth) return;
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
    if (!isPathAllowed(dir, homeDir, defaultCwd)) return;

    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      if (results.length >= maxResults) return;
      if (shouldSkipEntryName(dirent.name)) continue;
      if (dirent.isDirectory() && SKIP_DIR_NAMES.has(dirent.name)) continue;

      const childPath = resolve(dir, dirent.name);
      if (!isPathAllowed(childPath, homeDir, defaultCwd)) continue;

      if (dirent.isDirectory()) {
        if (dirent.name.toLowerCase().includes(normalizedQuery)) {
          results.push({ name: dirent.name, path: childPath, kind: "folder" });
        }
        walk(childPath, depth + 1);
      } else if (
        dirent.isFile() &&
        dirent.name.toLowerCase().includes(normalizedQuery)
      ) {
        results.push({ name: dirent.name, path: childPath, kind: "file" });
      }
    }
  }

  walk(root, 0);
  return results.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
