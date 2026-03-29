# Agent Notify Stage Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `agent-notify version` and stage-specific sound overrides for `needs_input`, `completed`, and `failed` while keeping the existing CLI command surface backward compatible.

**Architecture:** Extend the flat TOML config model with three optional stage-specific sound keys, keep `sound_file` as the global fallback, and make the sound provider choose a file from the normalized event state at send time. Add a dedicated top-level `version` command that reads the installed package metadata instead of hardcoding the version string.

**Tech Stack:** TypeScript, Node.js 24, vitest, tsup, npm

---

## File Map

- `src/cli.ts`
  - add `version`
  - extend `config set` / `config unset` key handling
- `src/config.ts`
  - add stage-specific sound config fields and TOML mappings
  - add helpers to resolve config keys and effective sound files
- `src/notifier.ts`
  - pass stage-specific sound config into the provider
- `src/providers.ts`
  - pick the effective sound file from the event state
- `tests-ts/cli.test.ts`
  - cover `version` and stage-specific config commands
- `tests-ts/config.test.ts`
  - cover stage-specific config parsing and resolution
- `tests-ts/notifier.test.ts`
  - cover stage-specific sound selection precedence
- `tests-ts/readme.test.ts`
  - cover the new docs
- `README.md`
  - document commands and stage mapping

### Task 1: Add Failing Tests For Version And Stage Sound Config

**Files:**
- Modify: `tests-ts/cli.test.ts`
- Modify: `tests-ts/config.test.ts`
- Modify: `tests-ts/notifier.test.ts`
- Modify: `tests-ts/readme.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("prints the installed package version", async () => {
  let stdout = "";

  const exitCode = await main(["version"], {
    stdout: {
      write: (chunk) => {
        stdout += chunk;
        return true;
      }
    }
  });

  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe("0.1.4");
});

it("parses stage-specific sound files from config", async () => {
  await writeFile(
    globalConfig,
    [
      'sound_file = "/global.wav"',
      'sound_file_failed = "/failed.wav"',
      'sound_file_completed = "/done.wav"'
    ].join("\n")
  );

  expect(loadConfig(cwd).soundFileFailed).toBe("/failed.wav");
  expect(loadConfig(cwd).soundFileCompleted).toBe("/done.wav");
});

it("prefers the stage-specific sound over the generic sound", async () => {
  const commands: Array<readonly string[]> = [];
  const provider = new SoundProvider({
    platform: "linux",
    soundFile: "/tmp/default.wav",
    stateSoundFiles: { failed: "/tmp/failed.wav" },
    commandExists: (command) => command === "paplay",
    run: async (command) => {
      commands.push(command);
      return { ok: true };
    }
  });

  await provider.send(makeEvent({ state: "failed" }));

  expect(commands).toEqual([["paplay", "/tmp/failed.wav"]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests-ts/cli.test.ts tests-ts/config.test.ts tests-ts/notifier.test.ts tests-ts/readme.test.ts`
Expected: FAIL because the version command, stage-specific config keys, and state-based sound selection do not exist yet

- [ ] **Step 3: Commit**

```bash
git add tests-ts/cli.test.ts tests-ts/config.test.ts tests-ts/notifier.test.ts tests-ts/readme.test.ts
git commit -m "test: cover version and stage sound configuration"
```

### Task 2: Implement Config, CLI, And Provider Changes

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/config.ts`
- Modify: `src/notifier.ts`
- Modify: `src/providers.ts`

- [ ] **Step 1: Implement minimal config support**

```ts
export interface AppConfig {
  soundFile?: string;
  soundFileNeedsInput?: string;
  soundFileCompleted?: string;
  soundFileFailed?: string;
}

const FILE_KEY_MAP = {
  sound_file: "soundFile",
  sound_file_needs_input: "soundFileNeedsInput",
  sound_file_completed: "soundFileCompleted",
  sound_file_failed: "soundFileFailed"
} as const;

export function getSoundFileForState(
  config: Pick<
    AppConfig,
    "soundFile" | "soundFileNeedsInput" | "soundFileCompleted" | "soundFileFailed"
  >,
  state: NormalizedState
): string | undefined {
  if (state === "needs_input" && config.soundFileNeedsInput) {
    return config.soundFileNeedsInput;
  }

  if (state === "completed" && config.soundFileCompleted) {
    return config.soundFileCompleted;
  }

  if (state === "failed" && config.soundFileFailed) {
    return config.soundFileFailed;
  }

  return config.soundFile;
}
```

- [ ] **Step 2: Implement the CLI surface**

```ts
if (command === "version") {
  runtime.stdout.write(`${await readPackageVersion(runtime.readFile)}\n`);
  return 0;
}

if (action === "set" && key === "sound-file-failed" && value !== undefined) {
  const next = setFlatTomlString(current, "sound_file_failed", value);
}
```

- [ ] **Step 3: Implement stage-aware sound playback**

```ts
new SoundProvider({
  platform: process.platform,
  soundFile: this.config.soundFile,
  stateSoundFiles: {
    needs_input: this.config.soundFileNeedsInput,
    completed: this.config.soundFileCompleted,
    failed: this.config.soundFileFailed
  }
});

async send(event: NormalizedEvent): Promise<boolean> {
  const soundFile = resolveSoundFile(event.state, this.stateSoundFiles, this.soundFile);
  for (const command of getSoundCommands(soundFile)) {
    // existing fallback behavior
  }
}
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- tests-ts/cli.test.ts tests-ts/config.test.ts tests-ts/notifier.test.ts tests-ts/readme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/config.ts src/notifier.ts src/providers.ts
git commit -m "feat: add version and stage-based sounds"
```

### Task 3: Update Documentation And Run Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README examples and mapping**

```md
agent-notify version
agent-notify config set sound-file-needs-input /absolute/path/to/input.wav
agent-notify config set sound-file-completed /absolute/path/to/done.wav
agent-notify config set sound-file-failed /absolute/path/to/fail.wav
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npm pack --dry-run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add version and stage sound configuration"
```
