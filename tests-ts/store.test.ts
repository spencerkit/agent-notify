import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { EventStore } from "../src/store.js";
import { TestClock, makeEvent } from "./test-helpers.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeStateDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-notify-store-"));
  createdDirs.push(dir);
  return dir;
}

describe("EventStore", () => {
  it("suppresses duplicates within the TTL window", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const store = new EventStore(await makeStateDir(), {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7,
      now: () => clock.now()
    });
    const event = makeEvent();

    expect(await store.shouldEmit(event)).toBe(true);

    await store.record(event);

    expect(await store.shouldEmit(event)).toBe(false);
  });

  it("allows the same event again after the TTL expires", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const store = new EventStore(await makeStateDir(), {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7,
      now: () => clock.now()
    });
    const event = makeEvent();

    await store.record(event);
    clock.advanceByMs(16_000);

    expect(await store.shouldEmit(event)).toBe(true);
  });

  it("prunes old log entries and keeps only the newest max entries", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const stateDir = await makeStateDir();
    const store = new EventStore(stateDir, {
      dedupeSeconds: 15,
      maxEntries: 2,
      maxAgeDays: 1,
      now: () => clock.now()
    });

    await store.record(
      makeEvent({
        summary: "stale",
        occurredAt: "2026-03-26T12:00:00.000Z"
      })
    );
    await store.record(
      makeEvent({
        summary: "keep-1",
        occurredAt: "2026-03-28T10:00:00.000Z"
      })
    );
    await store.record(
      makeEvent({
        summary: "keep-2",
        occurredAt: "2026-03-28T11:00:00.000Z"
      })
    );
    await store.record(
      makeEvent({
        summary: "keep-3",
        occurredAt: "2026-03-28T12:00:00.000Z"
      })
    );

    const logContents = await readFile(join(stateDir, "events.jsonl"), "utf8");
    const entries = logContents
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { summary: string; occurred_at: string });

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.summary)).toEqual(["keep-2", "keep-3"]);
    expect(entries.every((entry) => entry.occurred_at >= "2026-03-27T12:00:00.000Z")).toBe(true);
  });

  it("treats malformed dedupe state as empty", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const stateDir = await makeStateDir();
    const store = new EventStore(stateDir, {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7,
      now: () => clock.now()
    });
    const event = makeEvent();

    await writeFile(join(stateDir, "dedupe.json"), "{", "utf8");

    await expect(store.shouldEmit(event)).resolves.toBe(true);

    await store.record(event);

    expect(await store.shouldEmit(event)).toBe(false);
  });

  it("skips malformed log lines while keeping valid entries", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const stateDir = await makeStateDir();
    const store = new EventStore(stateDir, {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7,
      now: () => clock.now()
    });

    const validEntry = {
      tool: "claude",
      state: "completed",
      session_id: "session-1",
      cwd: "/tmp/demo",
      project: "demo",
      summary: "keep",
      occurred_at: "2026-03-28T12:00:00.000Z",
      raw_event: { summary: "keep" }
    };

    await writeFile(
      join(stateDir, "events.jsonl"),
      `${JSON.stringify(validEntry)}\nnot-json\n{"tool":`,
      "utf8"
    );

    await expect(store.readLog()).resolves.toEqual([validEntry]);
  });

  it("treats wrong-shape dedupe state as empty", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const stateDir = await makeStateDir();
    const store = new EventStore(stateDir, {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7,
      now: () => clock.now()
    });
    const event = makeEvent();

    await writeFile(join(stateDir, "dedupe.json"), JSON.stringify(null), "utf8");

    await expect(store.shouldEmit(event)).resolves.toBe(true);

    await writeFile(join(stateDir, "dedupe.json"), JSON.stringify({ a: 123, b: null }), "utf8");

    await expect(store.shouldEmit(event)).resolves.toBe(true);
  });

  it("skips wrong-shape jsonl entries while keeping valid entries", async () => {
    const clock = new TestClock(Date.parse("2026-03-28T12:00:00.000Z"));
    const stateDir = await makeStateDir();
    const store = new EventStore(stateDir, {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7,
      now: () => clock.now()
    });

    const validEntry = {
      tool: "claude",
      state: "completed",
      session_id: "session-1",
      cwd: "/tmp/demo",
      project: "demo",
      summary: "keep",
      occurred_at: "2026-03-28T12:00:00.000Z",
      raw_event: { summary: "keep" }
    };

    await writeFile(
      join(stateDir, "events.jsonl"),
      `${JSON.stringify(validEntry)}\nnull\n[]\n{}\n`,
      "utf8"
    );

    await expect(store.readLog()).resolves.toEqual([validEntry]);
  });
});
