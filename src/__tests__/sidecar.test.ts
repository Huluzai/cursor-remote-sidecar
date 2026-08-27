import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { trimRunEvents } from "../infra/session-repository.js";
import {
  assignTurnIdsToLines,
  coalesceRunEvents,
} from "../domain/transcript-service.js";
import { statusRank, normalizeCloudStatus } from "../domain/run-status.js";
import { RunEventPipeline } from "../domain/run-event-pipeline.js";
import { isStreamClosedError } from "../infra/cursor-sdk-adapter.js";
import type { LocalRun } from "../types/session.js";

describe("trimRunEvents", () => {
  it("keeps events under cap unchanged", () => {
    const events = [{ id: "1", event: "assistant", data: { text: "hi" } }];
    assert.equal(trimRunEvents(events), events);
  });

  it("caps events at MAX_EVENTS_PER_RUN", () => {
    const events = Array.from({ length: 2005 }, (_, i) => ({
      id: `e-${i}`,
      event: i === 0 ? "user" : "assistant",
      data: { text: `chunk-${i}` },
    }));
    const trimmed = trimRunEvents(events);
    assert.ok(trimmed.length <= 2000);
  });
});

describe("coalesceRunEvents", () => {
  it("merges assistant deltas and assigns turnId", () => {
    const run: LocalRun = {
      id: "run-1",
      agentId: "agent-1",
      status: "FINISHED",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:01Z",
      events: [
        { id: "1", event: "user", data: { text: "hello" } },
        { id: "2", event: "assistant", data: { text: "hel" } },
        { id: "3", event: "assistant", data: { text: "hello world" } },
      ],
    };
    const lines = coalesceRunEvents(run);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]!.kind, "user");
    assert.ok(lines[0]!.turnId);
    assert.equal(lines[1]!.kind, "assistant");
    assert.equal(lines[1]!.text, "hello world");
    assert.equal(lines[1]!.turnId, lines[0]!.turnId);
  });

  it("falls back to prompt and result when no events", () => {
    const run: LocalRun = {
      id: "run-2",
      agentId: "agent-1",
      status: "FINISHED",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:01Z",
      prompt: "test prompt",
      result: "done",
      events: [],
    };
    const lines = coalesceRunEvents(run);
    assert.equal(lines[0]!.text, "test prompt");
    assert.equal(lines[1]!.text, "done");
  });
});

describe("assignTurnIdsToLines", () => {
  it("propagates turnId to following lines", () => {
    const lines = [
      { kind: "user" as const, text: "q", turnId: "turn-a" },
      { kind: "assistant" as const, text: "a" },
      { kind: "tool" as const, text: "t" },
    ];
    assignTurnIdsToLines(lines);
    assert.equal(lines[1]!.turnId, "turn-a");
    assert.equal(lines[2]!.turnId, "turn-a");
  });
});

describe("run-status", () => {
  it("normalizes cloud status", () => {
    assert.equal(normalizeCloudStatus("running"), "RUNNING");
    assert.equal(normalizeCloudStatus("FINISHED"), "FINISHED");
  });

  it("ranks status for forward-only transitions", () => {
    assert.ok(statusRank("RUNNING") > statusRank("CREATING"));
    assert.ok(statusRank("FINISHED") > statusRank("RUNNING"));
  });
});

describe("RunEventPipeline", () => {
  it("deduplicates stream assistant snapshots", () => {
    const p = new RunEventPipeline();
    p.ingestDelta({ type: "text-delta", text: "hello" });
    const dup = p.ingestStreamAssistant("hello");
    assert.equal(dup.length, 0);
    const extend = p.ingestStreamAssistant("hello!");
    assert.equal(extend.length, 1);
    assert.equal(extend[0]!.type, "assistant");
    assert.equal((extend[0] as { text: string }).text, "!");
  });

  it("deduplicates tool calls by key", () => {
    const p = new RunEventPipeline();
    const first = p.ingestDelta({
      type: "tool-call-started",
      callId: "c1",
      toolCall: { type: "read", args: {} },
    });
    const dup = p.ingestDelta({
      type: "tool-call-started",
      callId: "c1",
      toolCall: { type: "read", args: {} },
    });
    assert.equal(first.length, 1);
    assert.equal(dup.length, 0);
  });
});

describe("isStreamClosedError", () => {
  it("matches WriteIterableClosedError by name", () => {
    const err = Object.assign(new Error("WritableIterable is closed"), {
      name: "WriteIterableClosedError",
    });
    assert.equal(isStreamClosedError(err), true);
  });

  it("matches message fallback", () => {
    assert.equal(
      isStreamClosedError(new Error("WritableIterable is closed")),
      true,
    );
  });

  it("ignores unrelated errors", () => {
    assert.equal(isStreamClosedError(new Error("agent busy")), false);
  });
});
