# Agent Notify TypeScript CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Python implementation with a native TypeScript/npm CLI that preserves the existing `agent-notify` command surface and behavior for Codex and Claude Code.

**Architecture:** Rebuild the runtime as a small Node package with focused modules for CLI dispatch, payload normalization, storage, providers, config loading, and installer patching. Remove Python packaging and runtime files after TypeScript parity is covered by tests, then validate the package with `npm test`, `npm run build`, and `npm pack`.

**Tech Stack:** TypeScript, Node.js 24, tsup, vitest, npm

---

### Task 1: Bootstrap The Node Package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Test: `tests-ts/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("package smoke", () => {
  it("exports a CLI entrypoint", async () => {
    const mod = await import("../src/cli");
    expect(typeof mod.main).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/smoke.test.ts`
Expected: FAIL because the package metadata and source files do not exist

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cli.ts
export function main(): number {
  return 0;
}
```

```json
// package.json
{
  "name": "agent-notify",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "agent-notify": "dist/cli.js"
  },
  "scripts": {
    "build": "tsup src/cli.ts --format esm --out-dir dist --clean",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/smoke.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/cli.ts src/index.ts tests-ts/smoke.test.ts
git commit -m "feat: bootstrap TypeScript CLI package"
```

### Task 2: Add Event Normalization

**Files:**
- Create: `src/events.ts`
- Test: `tests-ts/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseEvent } from "../src/events";

describe("parseEvent", () => {
  it("maps Codex notify payloads to completed events", () => {
    const event = parseEvent("codex", {
      type: "agent-turn-complete",
      "thread-id": "thread-1",
      "turn-id": "turn-1",
      cwd: "/tmp/demo",
      "input-messages": ["rename foo"],
      "last-assistant-message": "rename complete"
    });

    expect(event.tool).toBe("codex");
    expect(event.state).toBe("completed");
    expect(event.sessionId).toBe("thread-1");
    expect(event.project).toBe("demo");
    expect(event.summary).toBe("rename complete");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/events.test.ts`
Expected: FAIL because `parseEvent` does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export type NormalizedState = "completed" | "needs_input" | "failed";

export interface NormalizedEvent {
  tool: "codex" | "claude";
  state: NormalizedState;
  sessionId: string;
  cwd: string;
  project: string;
  summary: string;
  rawEvent: Record<string, unknown>;
  occurredAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/events.ts tests-ts/events.test.ts
git commit -m "feat: normalize Codex and Claude events"
```

### Task 3: Add Config Loading

**Files:**
- Create: `src/config.ts`
- Test: `tests-ts/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { shouldPlaySound } from "../src/config";

describe("config helpers", () => {
  it("disables completed sounds when configured off", () => {
    expect(shouldPlaySound({ soundEnabled: true, soundOnCompleted: false }, "completed")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/config.test.ts`
Expected: FAIL because config helpers do not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export interface AppConfig {
  desktopEnabled: boolean;
  soundEnabled: boolean;
  soundOnCompleted: boolean;
  dedupeSeconds: number;
  maxLogEntries: number;
  maxLogAgeDays: number;
  summaryLength: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests-ts/config.test.ts
git commit -m "feat: add config loading helpers"
```

### Task 4: Add Event Store And Dedupe

**Files:**
- Create: `src/store.ts`
- Test: `tests-ts/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { EventStore } from "../src/store";
import { makeEvent } from "./test-helpers";

describe("EventStore", () => {
  it("suppresses duplicates within the TTL window", async () => {
    const store = new EventStore("/tmp/agent-notify-test", {
      dedupeSeconds: 15,
      maxEntries: 10,
      maxAgeDays: 7
    });
    const event = makeEvent();

    expect(await store.shouldEmit(event)).toBe(true);
    await store.record(event);
    expect(await store.shouldEmit(event)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/store.test.ts`
Expected: FAIL because `EventStore` does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export class EventStore {
  constructor(private readonly stateDir: string, private readonly limits: StoreLimits) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store.ts tests-ts/store.test.ts tests-ts/test-helpers.ts
git commit -m "feat: add event store and dedupe"
```

### Task 5: Add Providers And Notify Pipeline

**Files:**
- Create: `src/providers.ts`
- Create: `src/notifier.ts`
- Test: `tests-ts/notifier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Notifier } from "../src/notifier";
import { makeEvent } from "./test-helpers";

describe("Notifier", () => {
  it("skips the sound provider for completed events when soundOnCompleted is false", async () => {
    const desktop = { send: async () => true };
    const sound = { send: async () => true };
    const notifier = new Notifier({
      config: {
        desktopEnabled: true,
        soundEnabled: true,
        soundOnCompleted: false,
        dedupeSeconds: 15,
        maxLogEntries: 10,
        maxLogAgeDays: 7,
        summaryLength: 180
      },
      store: {
        shouldEmit: async () => true,
        record: async () => {}
      },
      desktopProvider: desktop,
      soundProvider: sound
    });

    const result = await notifier.notify(makeEvent({ state: "completed" }));
    expect(result.desktopSent).toBe(true);
    expect(result.soundSent).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/notifier.test.ts`
Expected: FAIL because the notifier pipeline does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export class Notifier {
  constructor(private readonly deps: NotifierDeps) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/notifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers.ts src/notifier.ts tests-ts/notifier.test.ts
git commit -m "feat: add desktop and sound notification pipeline"
```

### Task 6: Add Installer Patching

**Files:**
- Create: `src/installers.ts`
- Test: `tests-ts/installers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { patchCodexConfig } from "../src/installers";

describe("patchCodexConfig", () => {
  it("keeps notify at top level before TOML tables", () => {
    const updated = patchCodexConfig('model = "gpt-5"\n\n[tui]\ntheme = "dark"\n', [
      "node",
      "dist/cli.js",
      "handle",
      "codex"
    ]);

    expect(updated.indexOf("notify =")).toBeLessThan(updated.indexOf("[tui]"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/installers.test.ts`
Expected: FAIL because installer patchers do not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export function patchCodexConfig(currentText: string, argv: string[]): string {
  return currentText;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/installers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/installers.ts tests-ts/installers.test.ts
git commit -m "feat: add Codex and Claude config patchers"
```

### Task 7: Wire The CLI Commands

**Files:**
- Modify: `src/cli.ts`
- Test: `tests-ts/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli";

describe("main", () => {
  it("routes codex handle payloads to the processor", async () => {
    const exitCode = await main([
      "handle",
      "codex",
      "{\"type\":\"agent-turn-complete\",\"thread-id\":\"thread-1\",\"turn-id\":\"turn-1\",\"cwd\":\"/tmp/demo\",\"input-messages\":[\"rename foo\"],\"last-assistant-message\":\"rename complete\"}"
    ]);

    expect(exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/cli.test.ts`
Expected: FAIL because CLI routing is incomplete

- [ ] **Step 3: Write minimal implementation**

```ts
export async function main(argv: string[]): Promise<number> {
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests-ts/cli.test.ts
git commit -m "feat: wire TypeScript CLI commands"
```

### Task 8: Replace Python Files And Update Docs

**Files:**
- Delete: `pyproject.toml`
- Delete: `src/agent_notify/__init__.py`
- Delete: `src/agent_notify/cli.py`
- Delete: `src/agent_notify/config.py`
- Delete: `src/agent_notify/events.py`
- Delete: `src/agent_notify/installers.py`
- Delete: `src/agent_notify/notifier.py`
- Delete: `src/agent_notify/providers.py`
- Delete: `src/agent_notify/store.py`
- Delete: `tests/conftest.py`
- Delete: `tests/test_cli.py`
- Delete: `tests/test_events.py`
- Delete: `tests/test_installers.py`
- Delete: `tests/test_notifier.py`
- Delete: `tests/test_store.py`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("README", () => {
  it("documents npm installation", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain("npm install -g agent-notify");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests-ts/readme.test.ts`
Expected: FAIL because README still documents Python installation

- [ ] **Step 3: Write minimal implementation**

```md
## Install

```bash
npm install -g agent-notify
```
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests-ts/readme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md package.json tsconfig.json vitest.config.ts src tests-ts
git rm pyproject.toml src/agent_notify tests
git commit -m "refactor: replace Python implementation with TypeScript CLI"
```

### Task 9: Build And Package Verification

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all vitest suites pass

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: `dist/cli.js` is produced with exit code 0

- [ ] **Step 3: Run package verification**

Run: `npm pack`
Expected: npm creates a tarball that includes `dist/cli.js`, `package.json`, and `README.md`

- [ ] **Step 4: Smoke the built CLI**

Run: `node dist/cli.js install codex --dry-run`
Expected: rendered Codex config contains a top-level `notify = [...]`

Run: `node dist/cli.js install claude --dry-run`
Expected: rendered Claude settings contain `Notification`, `Stop`, and `StopFailure` hooks

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "build: verify npm package output"
```
