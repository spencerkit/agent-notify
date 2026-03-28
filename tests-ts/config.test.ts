import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  defaultConfigPath,
  defaultStateDir,
  findRepoConfig,
  loadConfig,
  shouldPlaySound
} from "../src/config.js";

const cleanupPaths: string[] = [];
const ENV_KEYS = [
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
  "AGENT_NOTIFY_DESKTOP_ENABLED",
  "AGENT_NOTIFY_SOUND_ENABLED",
  "AGENT_NOTIFY_SOUND_ON_COMPLETED",
  "AGENT_NOTIFY_DEDUPE_SECONDS",
  "AGENT_NOTIFY_MAX_LOG_ENTRIES",
  "AGENT_NOTIFY_MAX_LOG_AGE_DAYS",
  "AGENT_NOTIFY_SUMMARY_LENGTH"
] as const;
const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  await Promise.all(
    cleanupPaths.splice(0).map((path) =>
      rm(path, {
        force: true,
        recursive: true
      })
    )
  );
});

describe("config helpers", () => {
  it("disables completed sounds when configured off", () => {
    expect(
      shouldPlaySound(
        { soundEnabled: true, soundOnCompleted: false },
        "completed"
      )
    ).toBe(false);
  });

  it("disables all sounds when soundEnabled is false", () => {
    expect(
      shouldPlaySound(
        { soundEnabled: false, soundOnCompleted: true },
        "needs_input"
      )
    ).toBe(false);
  });

  it("plays sounds for needs_input when soundEnabled is true", () => {
    expect(
      shouldPlaySound(
        { soundEnabled: true, soundOnCompleted: false },
        "needs_input"
      )
    ).toBe(true);
  });

  it("plays sounds for failed when soundEnabled is true", () => {
    expect(
      shouldPlaySound(
        { soundEnabled: true, soundOnCompleted: false },
        "failed"
      )
    ).toBe(true);
  });

  it("returns built-in defaults when no config files or env vars are present", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-notify-config-defaults-"));
    cleanupPaths.push(root);

    process.env.XDG_CONFIG_HOME = join(root, "xdg-config");
    process.env.XDG_STATE_HOME = join(root, "xdg-state");

    const cwd = join(root, "workspace", "project");
    await mkdir(cwd, { recursive: true });

    expect(loadConfig(cwd)).toEqual(DEFAULT_CONFIG);
  });

  it("walks up from cwd to find a repo override config", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-notify-config-repo-"));
    cleanupPaths.push(root);

    const repoRoot = join(root, "repo");
    const nested = join(repoRoot, "packages", "feature");
    const configPath = join(repoRoot, ".agent-notify.toml");

    await mkdir(nested, { recursive: true });
    await writeFile(configPath, "sound_enabled = false\n");

    expect(findRepoConfig(nested)).toBe(configPath);
  });

  it("loads config with env over repo over global over defaults precedence", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-notify-config-precedence-"));
    cleanupPaths.push(root);

    const xdgConfigHome = join(root, "xdg-config");
    const globalConfig = join(xdgConfigHome, "agent-notify", "config.toml");
    const repoRoot = join(root, "repo");
    const repoConfig = join(repoRoot, ".agent-notify.toml");
    const cwd = join(repoRoot, "nested", "cwd");

    process.env.XDG_CONFIG_HOME = xdgConfigHome;
    process.env.AGENT_NOTIFY_DEDUPE_SECONDS = "45";
    process.env.AGENT_NOTIFY_MAX_LOG_AGE_DAYS = "9";

    await mkdir(dirname(globalConfig), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      globalConfig,
      [
        "desktop_enabled = false",
        "sound_enabled = false",
        "sound_on_completed = false",
        "dedupe_seconds = 20",
        "max_log_entries = 100",
        "max_log_age_days = 8",
        "summary_length = 160"
      ].join("\n")
    );
    await writeFile(
      repoConfig,
      ["sound_enabled = true", "dedupe_seconds = 30", "summary_length = 170"].join(
        "\n"
      )
    );

    expect(loadConfig(cwd)).toEqual({
      desktopEnabled: false,
      soundEnabled: true,
      soundOnCompleted: false,
      dedupeSeconds: 45,
      maxLogEntries: 100,
      maxLogAgeDays: 9,
      summaryLength: 170
    });
  });

  it("falls back to built-in defaults when the highest-precedence env value is invalid", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-notify-config-invalid-env-"));
    cleanupPaths.push(root);

    const xdgConfigHome = join(root, "xdg-config");
    const globalConfig = join(xdgConfigHome, "agent-notify", "config.toml");
    const cwd = join(root, "workspace");

    process.env.XDG_CONFIG_HOME = xdgConfigHome;
    process.env.AGENT_NOTIFY_DEDUPE_SECONDS = "45x";

    await mkdir(dirname(globalConfig), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(globalConfig, "dedupe_seconds = 20\n");

    expect(loadConfig(cwd).dedupeSeconds).toBe(15);
  });

  it("falls back to built-in defaults when the highest-precedence repo value is invalid", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-notify-config-invalid-repo-"));
    cleanupPaths.push(root);

    const xdgConfigHome = join(root, "xdg-config");
    const globalConfig = join(xdgConfigHome, "agent-notify", "config.toml");
    const repoRoot = join(root, "repo");
    const repoConfig = join(repoRoot, ".agent-notify.toml");
    const cwd = join(repoRoot, "nested");

    process.env.XDG_CONFIG_HOME = xdgConfigHome;

    await mkdir(dirname(globalConfig), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(globalConfig, "dedupe_seconds = 20\n");
    await writeFile(repoConfig, 'dedupe_seconds = "bogus"\n');

    expect(loadConfig(cwd).dedupeSeconds).toBe(15);
  });

  it("falls back to built-in defaults when the highest-precedence boolean value is invalid", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-notify-config-invalid-bool-"));
    cleanupPaths.push(root);

    const xdgConfigHome = join(root, "xdg-config");
    const globalConfig = join(xdgConfigHome, "agent-notify", "config.toml");
    const repoRoot = join(root, "repo");
    const repoConfig = join(repoRoot, ".agent-notify.toml");
    const cwd = join(repoRoot, "nested");

    process.env.XDG_CONFIG_HOME = xdgConfigHome;

    await mkdir(dirname(globalConfig), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(globalConfig, "sound_enabled = false\n");
    await writeFile(repoConfig, 'sound_enabled = "bogus"\n');

    expect(loadConfig(cwd).soundEnabled).toBe(true);
  });

  it("uses XDG directories when set and falls back under the home directory", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-config-home";
    process.env.XDG_STATE_HOME = "/tmp/xdg-state-home";

    expect(defaultConfigPath()).toBe("/tmp/xdg-config-home/agent-notify/config.toml");
    expect(defaultStateDir()).toBe("/tmp/xdg-state-home/agent-notify");

    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_STATE_HOME;

    expect(defaultConfigPath()).toBe(
      join(process.env.HOME ?? "", ".config", "agent-notify", "config.toml")
    );
    expect(defaultStateDir()).toBe(
      join(process.env.HOME ?? "", ".local", "state", "agent-notify")
    );
  });
});
