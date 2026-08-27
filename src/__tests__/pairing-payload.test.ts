import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPairingPayload,
  parsePairingPayload,
  pickPrimaryHost,
  PairingPayloadError,
  validatePairingFields,
} from "../pairing-payload.js";

describe("pickPrimaryHost", () => {
  it("prefers LAN and Tailscale ranges", () => {
    assert.equal(
      pickPrimaryHost(["172.16.0.2", "192.168.1.8", "100.64.0.1"]),
      "192.168.1.8",
    );
    assert.equal(pickPrimaryHost(["172.16.0.2", "10.0.0.5"]), "10.0.0.5");
    assert.equal(pickPrimaryHost(["172.16.0.2", "100.64.0.1"]), "100.64.0.1");
  });

  it("falls back to first IPv4 or loopback", () => {
    assert.equal(pickPrimaryHost(["172.16.0.2"]), "172.16.0.2");
    assert.equal(pickPrimaryHost([]), "127.0.0.1");
  });
});

describe("buildPairingPayload", () => {
  it("builds cursor-remote pair URL", () => {
    const url = buildPairingPayload("192.168.1.8", 8787, "482916");
    assert.equal(
      url,
      "cursor-remote://pair?v=1&host=192.168.1.8&port=8787&token=482916",
    );
  });

  it("round-trips through parse", () => {
    const url = buildPairingPayload("10.0.0.5", 8787, "123456");
    assert.deepEqual(parsePairingPayload(url), {
      host: "10.0.0.5",
      port: 8787,
      token: "123456",
    });
  });
});

describe("validatePairingFields", () => {
  it("rejects invalid token", () => {
    assert.throws(
      () => validatePairingFields("1.2.3.4", 8787, "12345"),
      PairingPayloadError,
    );
  });

  it("rejects invalid port", () => {
    assert.throws(
      () => validatePairingFields("1.2.3.4", 0, "123456"),
      PairingPayloadError,
    );
    assert.throws(
      () => validatePairingFields("1.2.3.4", 70000, "123456"),
      PairingPayloadError,
    );
  });
});

describe("parsePairingPayload", () => {
  it("rejects unknown scheme", () => {
    assert.throws(
      () => parsePairingPayload("https://example.com/pair?v=1"),
      PairingPayloadError,
    );
  });
});
