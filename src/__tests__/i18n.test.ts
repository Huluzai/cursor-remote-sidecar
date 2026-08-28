import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLocale,
  initLocale,
  resolveLocaleFromEnv,
  setLocale,
  t,
} from "../i18n/index.js";

describe("resolveLocaleFromEnv", () => {
  it("honors SIDECAR_LANG over LANG", () => {
    assert.equal(
      resolveLocaleFromEnv({ SIDECAR_LANG: "en", LANG: "zh_CN.UTF-8" }),
      "en",
    );
    assert.equal(
      resolveLocaleFromEnv({ SIDECAR_LOCALE: "zh-CN", LANG: "en_US.UTF-8" }),
      "zh",
    );
  });

  it("falls back to LANG / LC_ALL", () => {
    assert.equal(resolveLocaleFromEnv({ LANG: "zh_TW.UTF-8" }), "zh");
    assert.equal(resolveLocaleFromEnv({ LC_ALL: "zh_CN.UTF-8" }), "zh");
    assert.equal(resolveLocaleFromEnv({ LANG: "en_US.UTF-8" }), "en");
    assert.equal(resolveLocaleFromEnv({}), "en");
  });
});

describe("t", () => {
  it("interpolates params and switches catalog", () => {
    setLocale("en");
    assert.equal(
      t("startup.cursorLoggedInWithEmail", { email: "a@b.c" }),
      "  Cursor:  logged in (a@b.c)",
    );
    setLocale("zh");
    assert.equal(
      t("startup.cursorLoggedInWithEmail", { email: "a@b.c" }),
      "  Cursor:  已登录 (a@b.c)",
    );
    assert.equal(t("pairing.scanQr"), "用 iPhone 扫描下方二维码配对（Path C）");
  });

  it("initLocale applies env", () => {
    const locale = initLocale({ SIDECAR_LANG: "zh" });
    assert.equal(locale, "zh");
    assert.equal(getLocale(), "zh");
    initLocale({ SIDECAR_LANG: "en" });
    assert.equal(getLocale(), "en");
  });
});
