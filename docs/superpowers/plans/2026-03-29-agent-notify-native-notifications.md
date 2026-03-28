# Agent Notify Native Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Windows-family notifications, configurable custom sound playback, and `agent-notify config` commands without changing the existing install/handle command surface.

**Architecture:** Extend the existing flat TOML config model with `sound_file`, add CLI helpers for reading and mutating the global config file, and update the provider layer so desktop delivery and sound playback route by platform. Keep notifier behavior fail-open: event recording must continue even when desktop or sound delivery fails.

**Tech Stack:** TypeScript, Node.js 24, vitest, tsup, npm, PowerShell, osascript, notify-send

---

## File Map

- `src/config.ts`
  - Extend `AppConfig` with `soundFile`
  - Parse `sound_file`
  - Add stable flat-TOML render/update helpers for the global config file
- `src/cli.ts`
  - Add `config get`, `config set sound-file <path>`, `config unset sound-file`
  - Reuse runtime `readFile`, `writeFile`, and `mkdir` for config file access
- `src/notifier.ts`
  - Pass resolved config into the default desktop and sound providers
- `src/providers.ts`
  - Detect Windows/WSL/macOS/Linux routing
  - Build non-blocking PowerShell toast commands
  - Build custom sound playback commands and fallback order
- `tests-ts/config.test.ts`
  - Cover `sound_file` parsing, defaults, and TOML mutation helpers
- `tests-ts/cli.test.ts`
  - Cover `config` command output and global config file writes
- `tests-ts/notifier.test.ts`
  - Cover Windows/WSL provider selection and custom sound fallback behavior
- `tests-ts/readme.test.ts`
  - Cover the new CLI documentation
- `README.md`
  - Document native routing, sound configuration, and config commands

### Task 1: Extend Config Parsing And TOML Helpers

**Files:**
- Modify: `src/config.ts`
- Test: `tests-ts/config.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("parses sound_file from the highest-precedence config source", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-notify-config-sound-file-"));
  cleanupPaths.push(root);

  const xdgConfigHome = join(root, "xdg-config");
  const globalConfig = join(xdgConfigHome, "agent-notify", "config.toml");
  const repoRoot = join(root, "repo");
  const repoConfig = join(repoRoot, ".agent-notify.toml");
  const cwd = join(repoRoot, "nested");

  process.env.XDG_CONFIG_HOME = xdgConfigHome;

  await mkdir(dirname(globalConfig), { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(globalConfig, 'sound_file = "/global/chime.wav"\n');
  await writeFile(repoConfig, 'sound_file = "/repo/override.wav"\n');

  expect(loadConfig(cwd).soundFile).toBe("/repo/override.wav");
});

it("upserts and unsets sound_file while preserving unrelated TOML keys", () => {
  const source = ['desktop_enabled = false', 'custom_key = "keep-me"'].join("\n");

  expect(setFlatTomlString(source, "sound_file", "/tmp/ding.wav")).toContain(
    'sound_file = "/tmp/ding.wav"'
  );
  expect(unsetFlatTomlKey(source + '\nsound_file = "/tmp/ding.wav"\n', "sound_file")).toContain(
    'custom_key = "keep-me"'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests-ts/config.test.ts`
Expected: FAIL because `AppConfig` does not expose `soundFile` and the TOML mutation helpers do not exist

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
  soundFile?: string;
}

const FILE_KEY_MAP = {
  desktop_enabled: "desktopEnabled",
  sound_enabled: "soundEnabled",
  sound_on_completed: "soundOnCompleted",
  dedupe_seconds: "dedupeSeconds",
  max_log_entries: "maxLogEntries",
  max_log_age_days: "maxLogAgeDays",
  summary_length: "summaryLength",
  sound_file: "soundFile"
} as const satisfies Record<string, AppConfigKey>;

function coerceString(value: string | undefined): string | undefined {
  const normalized = unquote(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function formatConfigToml(config: AppConfig): string {
  return [
    `desktop_enabled = ${config.desktopEnabled}`,
    `sound_enabled = ${config.soundEnabled}`,
    `sound_on_completed = ${config.soundOnCompleted}`,
    `dedupe_seconds = ${config.dedupeSeconds}`,
    `max_log_entries = ${config.maxLogEntries}`,
    `max_log_age_days = ${config.maxLogAgeDays}`,
    `summary_length = ${config.summaryLength}`,
    ...(config.soundFile ? [`sound_file = ${JSON.stringify(config.soundFile)}`] : [])
  ].join("\n") + "\n";
}

export function setFlatTomlString(source: string, key: string, value: string): string {
  const assignment = `${key} = ${JSON.stringify(value)}`;
  return upsertFlatTomlLine(source, key, assignment);
}

export function unsetFlatTomlKey(source: string, key: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim() === "" || !line.trim().startsWith(`${key} =`))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests-ts/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests-ts/config.test.ts
git commit -m "feat: add sound file config helpers"
```

### Task 2: Add Global Config CLI Commands

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/config.ts`
- Test: `tests-ts/cli.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("prints stable TOML defaults for config get when the global config file is missing", async () => {
  let stdout = "";

  const exitCode = await main(["config", "get"], {
    stdout: {
      write: (chunk) => {
        stdout += chunk;
        return true;
      }
    },
    readFile: async () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
  });

  expect(exitCode).toBe(0);
  expect(stdout).toContain("desktop_enabled = true");
  expect(stdout).toContain("sound_enabled = true");
});

it("writes sound_file with config set sound-file", async () => {
  const mkdir = vi.fn(async (_path: string) => {});
  const writeFile = vi.fn(async (_path: string, _content: string, _encoding: BufferEncoding) => {});

  const exitCode = await main(["config", "set", "sound-file", "/tmp/ding.wav"], {
    mkdir,
    writeFile,
    readFile: async () => ""
  });

  expect(exitCode).toBe(0);
  expect(mkdir).toHaveBeenCalled();
  expect(writeFile).toHaveBeenCalledWith(
    expect.stringContaining("agent-notify/config.toml"),
    expect.stringContaining('sound_file = "/tmp/ding.wav"'),
    "utf8"
  );
});

it("removes only sound_file with config unset sound-file", async () => {
  const writeFile = vi.fn(async (_path: string, _content: string, _encoding: BufferEncoding) => {});

  const exitCode = await main(["config", "unset", "sound-file"], {
    writeFile,
    readFile: async () => ['desktop_enabled = false', 'sound_file = "/tmp/ding.wav"'].join("\n")
  });

  expect(exitCode).toBe(0);
  expect(writeFile).toHaveBeenCalledWith(
    expect.any(String),
    expect.not.stringContaining("sound_file"),
    "utf8"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests-ts/cli.test.ts`
Expected: FAIL because the `config` command group does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
if (command === "config") {
  return await configCommand(rest, io);
}

async function configCommand(
  argv: readonly string[],
  runtime: Required<MainDependencies>
): Promise<number> {
  const configPath = defaultConfigPath();
  const [action, key, value] = argv;

  if (action === "get") {
    const current = await readExistingText(configPath, runtime.readFile);
    runtime.stdout.write(current || formatConfigToml(DEFAULT_CONFIG));
    return 0;
  }

  if (action === "set" && key === "sound-file" && value) {
    const next = setFlatTomlString(
      await readExistingText(configPath, runtime.readFile),
      "sound_file",
      value
    );
    await runtime.mkdir(dirname(configPath));
    await runtime.writeFile(configPath, next, "utf8");
    return 0;
  }

  if (action === "unset" && key === "sound-file") {
    const next = unsetFlatTomlKey(
      await readExistingText(configPath, runtime.readFile),
      "sound_file"
    );
    await runtime.mkdir(dirname(configPath));
    await runtime.writeFile(configPath, next, "utf8");
    return 0;
  }

  throw new Error("usage: agent-notify config <get|set|unset> ...");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests-ts/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/config.ts tests-ts/cli.test.ts
git commit -m "feat: add agent-notify config commands"
```

### Task 3: Route Native Desktop Notifications And Custom Sound Playback

**Files:**
- Modify: `src/notifier.ts`
- Modify: `src/providers.ts`
- Test: `tests-ts/notifier.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("uses PowerShell toast delivery on native Windows", async () => {
  const commands: Array<readonly string[]> = [];
  const provider = new DesktopProvider({
    platform: "win32",
    commandExists: (command) => command === "powershell.exe",
    run: async (command) => {
      commands.push(command);
      return { ok: true };
    }
  });

  const sent = await provider.send(
    makeEvent({ tool: "claude", state: "failed", project: "demo", summary: "Needs attention" })
  );

  expect(sent).toBe(true);
  expect(commands[0]?.[0]).toBe("powershell.exe");
  expect(commands[0]?.[3]).toContain("ToastNotificationManager");
});

it("uses the configured sound file through PowerShell on Windows-family runtimes", async () => {
  const commands: Array<readonly string[]> = [];
  const provider = new SoundProvider({
    platform: "win32",
    soundFile: "C:\\Users\\spencer\\ding.wav",
    commandExists: (command) => command === "powershell.exe",
    run: async (command) => {
      commands.push(command);
      return { ok: true };
    }
  });

  const sent = await provider.send(makeEvent({ state: "failed" }));

  expect(sent).toBe(true);
  expect(commands[0]?.[3]).toContain("System.Media.SoundPlayer");
  expect(commands[0]?.[3]).toContain("C:\\Users\\spencer\\ding.wav");
});

it("falls back from a failed custom sound command to the next sound mechanism", async () => {
  const commands: Array<readonly string[]> = [];
  const provider = new SoundProvider({
    platform: "linux",
    soundFile: "/tmp/ding.wav",
    commandExists: (command) => command === "paplay",
    run: async (command) => {
      commands.push(command);
      throw new Error("paplay failed");
    },
    writeTerminalBell: async () => {}
  });

  const sent = await provider.send(makeEvent({ state: "failed" }));

  expect(sent).toBe(true);
  expect(commands).toEqual([["paplay", "/tmp/ding.wav"]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests-ts/notifier.test.ts`
Expected: FAIL because the providers do not accept `platform` or `soundFile` options and native Windows routing is incomplete

- [ ] **Step 3: Write minimal implementation**

```ts
export interface DesktopProviderOptions {
  commandExists?: (command: string) => boolean | Promise<boolean>;
  run?: (command: readonly string[]) => Promise<{ ok: boolean }>;
  isWsl?: () => boolean;
  platform?: NodeJS.Platform;
}

export interface SoundProviderOptions {
  commandExists?: (command: string) => boolean | Promise<boolean>;
  run?: (command: readonly string[]) => Promise<{ ok: boolean }>;
  writeTerminalBell?: () => void | Promise<void>;
  writeStdoutBell?: () => void | Promise<void>;
  isWsl?: () => boolean;
  platform?: NodeJS.Platform;
  soundFile?: string;
}

if ((this.platform === "win32" || this.isWsl()) && (await this.commandExists("powershell.exe"))) {
  return this.execute([
    "powershell.exe",
    "-NoProfile",
    "-Command",
    buildWindowsToastScript(title, event.summary)
  ]);
}

if (this.soundFile && (this.platform === "win32" || this.isWsl())) {
  return this.execute([
    "powershell.exe",
    "-NoProfile",
    "-Command",
    buildWindowsSoundScript(this.soundFile)
  ]);
}

for (const directory of pathValue.split(delimiter)) {
  const candidate = join(directory, command);
  await access(candidate, fsConstants.X_OK);
}

this.desktopProvider =
  options.desktopProvider ?? new DesktopProvider({ platform: process.platform });
this.soundProvider =
  options.soundProvider ?? new SoundProvider({ platform: process.platform, soundFile: this.config.soundFile });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests-ts/notifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/notifier.ts src/providers.ts tests-ts/notifier.test.ts
git commit -m "feat: add native desktop and custom sound routing"
```

### Task 4: Document The New Workflow And Run Full Verification

**Files:**
- Modify: `README.md`
- Modify: `tests-ts/readme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("documents config commands and custom sound setup", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  expect(readme).toContain("agent-notify config get");
  expect(readme).toContain("agent-notify config set sound-file");
  expect(readme).toContain("sound_file");
  expect(readme).toContain("WSL -> Windows toast notifications");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests-ts/readme.test.ts`
Expected: FAIL because the README does not mention config commands or native routing

- [ ] **Step 3: Write minimal implementation**

~~~md
## Configure sound

```bash
agent-notify config get
agent-notify config set sound-file /absolute/path/to/ding.wav
agent-notify config unset sound-file
```

`agent-notify` stores global config in `~/.config/agent-notify/config.toml`.

Routing summary:
- WSL -> Windows toast notifications
- Windows -> Windows toast notifications
- macOS -> `osascript`
- Linux -> `notify-send`
~~~

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests-ts/readme.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full verification suite**

Run: `npm test`
Expected: PASS across config, CLI, notifier, README, installer, store, and workflow coverage

Run: `npm run build`
Expected: PASS and emit `dist/cli.js`

Run: `npm pack --dry-run`
Expected: PASS and show the package tarball contents without publishing

- [ ] **Step 6: Commit**

```bash
git add README.md tests-ts/readme.test.ts
git commit -m "docs: add native notification and sound config usage"
```
