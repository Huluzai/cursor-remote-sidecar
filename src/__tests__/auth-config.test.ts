import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loginRequiredMessage, resolveCursorAuth } from "../auth.js";
import { loadOrCreatePairingTokenForTest } from "../config.js";
import { setLocale } from "../i18n/index.js";
import { sdkAuthOptions } from "../sdk-auth.js";
import type { SidecarConfig } from "../config.js";

describe("resolveCursorAuth", () => {
  it("uses env key without calling login (dev shortcut)", async () => {
    let loginCalled = false;
    const auth = await resolveCursorAuth({
      envApiKey: "crsr_test_key",
      status: async () => ({ status: "logged-out" }),
      login: async () => {
        loginCalled = true;
        return { apiKey: "never" };
      },
    });
    assert.equal(auth.source, "env");
    assert.equal(auth.apiKey, "crsr_test_key");
    assert.equal(loginCalled, false);
  });

  it("uses stored login without calling login", async () => {
    let loginCalled = false;
    const auth = await resolveCursorAuth({
      status: async () => ({ status: "logged-in", email: "dev@cursor.com" }),
      login: async () => {
        loginCalled = true;
        return { apiKey: "never" };
      },
    });
    assert.equal(auth.source, "stored");
    assert.equal(auth.email, "dev@cursor.com");
    assert.equal(auth.apiKey, undefined);
    assert.equal(loginCalled, false);
  });

  it("calls login when logged out and succeeds", async () => {
    let loginCalled = false;
    const auth = await resolveCursorAuth({
      status: async () => ({ status: "logged-out" }),
      login: async (opts) => {
        loginCalled = true;
        assert.equal(opts.apiKeyName, "cursor-remote-sidecar");
        return { apiKey: "minted", email: "user@example.com" };
      },
    });
    assert.equal(loginCalled, true);
    assert.equal(auth.source, "login");
    assert.equal(auth.email, "user@example.com");
    assert.equal(auth.apiKey, undefined);
  });

  it("throws on login failure with user-facing message", async () => {
    await assert.rejects(
      () =>
        resolveCursorAuth({
          status: async () => ({ status: "logged-out" }),
          login: async () => {
            throw new Error("cancelled");
          },
        }),
      (err: Error) => {
        assert.match(err.message, /cancelled/);
        return true;
      },
    );
    setLocale("zh");
    const zhMsg = loginRequiredMessage();
    assert.match(zhMsg, /浏览器/);
    assert.doesNotMatch(zhMsg, /CURSOR_API_KEY/);
    assert.doesNotMatch(zhMsg, /Dashboard/);
    setLocale("en");
    const enMsg = loginRequiredMessage();
    assert.match(enMsg, /browser/i);
    assert.doesNotMatch(enMsg, /CURSOR_API_KEY/);
  });
});

describe("sdkAuthOptions", () => {
  it("includes apiKey only when config has one", () => {
    const withKey = sdkAuthOptions({
      apiKey: "secret",
    } as SidecarConfig);
    assert.deepEqual(withKey, { apiKey: "secret" });

    const stored = sdkAuthOptions({} as SidecarConfig);
    assert.deepEqual(stored, {});
  });
});

describe("loadOrCreatePairingTokenForTest", () => {
  it("prefers env token over file", () => {
    const dir = mkdtempSync(join(tmpdir(), "sidecar-pair-"));
    try {
      const first = loadOrCreatePairingTokenForTest(dir, "123456");
      assert.equal(first.token, "123456");
      assert.equal(first.persisted, false);

      const second = loadOrCreatePairingTokenForTest(dir, "123456");
      assert.equal(second.token, "123456");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists generated token and reuses on next load", () => {
    const dir = mkdtempSync(join(tmpdir(), "sidecar-pair-"));
    try {
      const first = loadOrCreatePairingTokenForTest(dir, "");
      assert.match(first.token, /^\d{6}$/);
      assert.equal(first.persisted, true);

      const onDisk = readFileSync(join(dir, "pairing-token"), "utf8").trim();
      assert.equal(onDisk, first.token);

      const second = loadOrCreatePairingTokenForTest(dir, "");
      assert.equal(second.token, first.token);
      assert.equal(second.persisted, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
