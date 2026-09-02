import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listBrowseEntries,
  searchBrowseEntriesRecursive,
  shouldSkipEntryName,
} from "../utils/browse.js";

describe("shouldSkipEntryName", () => {
  it("skips dotfiles", () => {
    assert.equal(shouldSkipEntryName(".git"), true);
    assert.equal(shouldSkipEntryName("src"), false);
  });
});

describe("listBrowseEntries", () => {
  it("lists files and folders with optional query filter", () => {
    const root = mkdtempSync(join(tmpdir(), "browse-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "README.md"), "# hi");
    writeFileSync(join(root, "SessionView.swift"), "struct X {}");

    const all = listBrowseEntries(root, root, root);
    assert.equal(all.length, 3);
    assert.ok(all.some((e) => e.kind === "folder" && e.name === "src"));
    assert.ok(all.some((e) => e.kind === "file" && e.name === "README.md"));
    assert.ok(all.some((e) => e.kind === "file" && e.name === "SessionView.swift"));

    const filtered = listBrowseEntries(root, root, root, "Session");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, "SessionView.swift");
  });
});

describe("searchBrowseEntriesRecursive", () => {
  it("finds nested files by substring", () => {
    const root = mkdtempSync(join(tmpdir(), "browse-rec-"));
    mkdirSync(join(root, "ios"), { recursive: true });
    writeFileSync(join(root, "ios", "APIModels.swift"), "struct A {}");

    const results = searchBrowseEntriesRecursive(root, root, root, "APIModels");
    assert.equal(results.length, 1);
    assert.equal(results[0]?.kind, "file");
    assert.match(results[0]?.path ?? "", /APIModels\.swift$/);
  });
});
