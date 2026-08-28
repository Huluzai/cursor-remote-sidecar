import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveDefaultCwd } from "../config.js";
import {
  folderParentIfAllowed,
  isPathAllowed,
  resolveFolderListPath,
} from "../utils/folders.js";

describe("resolveDefaultCwd", () => {
  it("uses home when SIDECAR_CWD is unset or blank", () => {
    assert.equal(resolveDefaultCwd(undefined, "/Users/jian"), "/Users/jian");
    assert.equal(resolveDefaultCwd("  ", "/Users/jian"), "/Users/jian");
  });

  it("uses SIDECAR_CWD when set", () => {
    assert.equal(
      resolveDefaultCwd("/Users/jian/Projects/app", "/Users/jian"),
      "/Users/jian/Projects/app",
    );
  });
});

describe("resolveFolderListPath", () => {
  const home = "/Users/jian";
  const defaultCwd = "/Users/jian";

  it("defaults to defaultCwd when path is omitted", () => {
    assert.equal(resolveFolderListPath(undefined, home, defaultCwd), defaultCwd);
    assert.equal(resolveFolderListPath("", home, defaultCwd), defaultCwd);
  });

  it("maps ~ and home to the user home directory", () => {
    assert.equal(resolveFolderListPath("~", home, defaultCwd), home);
    assert.equal(resolveFolderListPath("home", home, defaultCwd), home);
    assert.equal(resolveFolderListPath("HOME", home, defaultCwd), home);
  });

  it("expands ~/relative paths", () => {
    assert.equal(
      resolveFolderListPath("~/Projects", home, defaultCwd),
      resolve(home, "Projects"),
    );
  });
});

describe("folderParentIfAllowed", () => {
  const home = "/Users/jian";

  it("hides parent at home so the picker cannot leave the sandbox", () => {
    assert.equal(folderParentIfAllowed(home, home, home), null);
    assert.equal(isPathAllowed("/Users", home, home), false);
  });

  it("allows parent when browsing a folder under home", () => {
    assert.equal(
      folderParentIfAllowed("/Users/jian/Projects", home, home),
      home,
    );
  });
});
