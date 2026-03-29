import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { NormalizedState } from "./events.js";

export interface AppConfig {
  desktopEnabled: boolean;
  soundEnabled: boolean;
  soundOnCompleted: boolean;
  notifyNeedsInput: boolean;
  notifyCompleted: boolean;
  notifyFailed: boolean;
  dedupeSeconds: number;
  maxLogEntries: number;
  maxLogAgeDays: number;
  summaryLength: number;
  soundTheme?: string;
  soundFile?: string;
  soundFileNeedsInput?: string;
  soundFileCompleted?: string;
  soundFileFailed?: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  desktopEnabled: true,
  soundEnabled: true,
  soundOnCompleted: true,
  notifyNeedsInput: true,
  notifyCompleted: true,
  notifyFailed: true,
  dedupeSeconds: 15,
  maxLogEntries: 5000,
  maxLogAgeDays: 7,
  summaryLength: 180
};

type AppConfigKey = keyof AppConfig;

const FILE_KEY_MAP = {
  desktop_enabled: "desktopEnabled",
  sound_enabled: "soundEnabled",
  sound_on_completed: "soundOnCompleted",
  notify_needs_input: "notifyNeedsInput",
  notify_completed: "notifyCompleted",
  notify_failed: "notifyFailed",
  dedupe_seconds: "dedupeSeconds",
  max_log_entries: "maxLogEntries",
  max_log_age_days: "maxLogAgeDays",
  summary_length: "summaryLength",
  sound_theme: "soundTheme",
  sound_file: "soundFile",
  sound_file_needs_input: "soundFileNeedsInput",
  sound_file_completed: "soundFileCompleted",
  sound_file_failed: "soundFileFailed"
} as const satisfies Record<string, AppConfigKey>;

const ENV_KEY_MAP = {
  AGENT_NOTIFY_DESKTOP_ENABLED: "desktopEnabled",
  AGENT_NOTIFY_SOUND_ENABLED: "soundEnabled",
  AGENT_NOTIFY_SOUND_ON_COMPLETED: "soundOnCompleted",
  AGENT_NOTIFY_DEDUPE_SECONDS: "dedupeSeconds",
  AGENT_NOTIFY_MAX_LOG_ENTRIES: "maxLogEntries",
  AGENT_NOTIFY_MAX_LOG_AGE_DAYS: "maxLogAgeDays",
  AGENT_NOTIFY_SUMMARY_LENGTH: "summaryLength"
} as const satisfies Record<string, AppConfigKey>;

type RawConfig = Partial<Record<AppConfigKey, string>>;

export function defaultStateDir(): string {
  return process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, "agent-notify")
    : join(homedir(), ".local", "state", "agent-notify");
}

export function defaultConfigPath(): string {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "agent-notify", "config.toml")
    : join(homedir(), ".config", "agent-notify", "config.toml");
}

export function findRepoConfig(cwd?: string): string | undefined {
  if (!cwd) {
    return undefined;
  }

  let current = resolve(cwd);

  while (true) {
    const candidate = join(current, ".agent-notify.toml");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export function loadConfig(cwd?: string): AppConfig {
  const mergedRaw = {
    ...readTomlConfig(defaultConfigPath()),
    ...readTomlConfig(findRepoConfig(cwd)),
    ...readEnvConfig()
  };
  const soundFile = coerceString(mergedRaw.soundFile);
  const soundFileNeedsInput = coerceString(mergedRaw.soundFileNeedsInput);
  const soundFileCompleted = coerceString(mergedRaw.soundFileCompleted);
  const soundFileFailed = coerceString(mergedRaw.soundFileFailed);
  const soundTheme = coerceString(mergedRaw.soundTheme);

  return {
    desktopEnabled: coerceBoolean(
      mergedRaw.desktopEnabled,
      DEFAULT_CONFIG.desktopEnabled
    ),
    soundEnabled: coerceBoolean(mergedRaw.soundEnabled, DEFAULT_CONFIG.soundEnabled),
    soundOnCompleted: coerceBoolean(
      mergedRaw.soundOnCompleted,
      DEFAULT_CONFIG.soundOnCompleted
    ),
    notifyNeedsInput: coerceBoolean(
      mergedRaw.notifyNeedsInput,
      DEFAULT_CONFIG.notifyNeedsInput
    ),
    notifyCompleted: coerceBoolean(
      mergedRaw.notifyCompleted,
      DEFAULT_CONFIG.notifyCompleted
    ),
    notifyFailed: coerceBoolean(
      mergedRaw.notifyFailed,
      DEFAULT_CONFIG.notifyFailed
    ),
    dedupeSeconds: coerceInteger(
      mergedRaw.dedupeSeconds,
      DEFAULT_CONFIG.dedupeSeconds
    ),
    maxLogEntries: coerceInteger(
      mergedRaw.maxLogEntries,
      DEFAULT_CONFIG.maxLogEntries
    ),
    maxLogAgeDays: coerceInteger(
      mergedRaw.maxLogAgeDays,
      DEFAULT_CONFIG.maxLogAgeDays
    ),
    summaryLength: coerceInteger(
      mergedRaw.summaryLength,
      DEFAULT_CONFIG.summaryLength
    ),
    ...(soundFile ? { soundFile } : {}),
    ...(soundTheme ? { soundTheme } : {}),
    ...(soundFileNeedsInput ? { soundFileNeedsInput } : {}),
    ...(soundFileCompleted ? { soundFileCompleted } : {}),
    ...(soundFileFailed ? { soundFileFailed } : {})
  };
}

export function formatConfigToml(config: AppConfig): string {
  return (
    [
      `desktop_enabled = ${config.desktopEnabled}`,
      `sound_enabled = ${config.soundEnabled}`,
      `sound_on_completed = ${config.soundOnCompleted}`,
      `notify_needs_input = ${config.notifyNeedsInput}`,
      `notify_completed = ${config.notifyCompleted}`,
      `notify_failed = ${config.notifyFailed}`,
      `dedupe_seconds = ${config.dedupeSeconds}`,
      `max_log_entries = ${config.maxLogEntries}`,
      `max_log_age_days = ${config.maxLogAgeDays}`,
      `summary_length = ${config.summaryLength}`,
      ...(config.soundTheme
        ? [`sound_theme = ${JSON.stringify(config.soundTheme)}`]
        : []),
      ...(config.soundFile
        ? [`sound_file = ${JSON.stringify(config.soundFile)}`]
        : []),
      ...(config.soundFileNeedsInput
        ? [`sound_file_needs_input = ${JSON.stringify(config.soundFileNeedsInput)}`]
        : []),
      ...(config.soundFileCompleted
        ? [`sound_file_completed = ${JSON.stringify(config.soundFileCompleted)}`]
        : []),
      ...(config.soundFileFailed
        ? [`sound_file_failed = ${JSON.stringify(config.soundFileFailed)}`]
        : [])
    ].join("\n") + "\n"
  );
}

export function setFlatTomlString(
  source: string,
  key: string,
  value: string
): string {
  const assignment = `${key} = ${JSON.stringify(value)}`;
  return upsertFlatTomlLine(source, key, assignment);
}

export function setFlatTomlBoolean(source: string, key: string, value: boolean): string {
  return upsertFlatTomlLine(source, key, `${key} = ${value}`);
}

export function unsetFlatTomlKey(source: string, key: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim() === "" || !matchesFlatTomlKey(line, key))
    .join("\n");
}

export function shouldPlaySound(
  config: Pick<AppConfig, "soundEnabled" | "soundOnCompleted">,
  state: NormalizedState
): boolean {
  if (!config.soundEnabled) {
    return false;
  }

  if (state === "completed") {
    return config.soundOnCompleted;
  }

  return state === "needs_input" || state === "failed";
}

export function shouldNotifyState(
  config: Pick<AppConfig, "notifyNeedsInput" | "notifyCompleted" | "notifyFailed">,
  state: NormalizedState
): boolean {
  if (state === "needs_input") {
    return config.notifyNeedsInput;
  }

  if (state === "completed") {
    return config.notifyCompleted;
  }

  return config.notifyFailed;
}

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

function readTomlConfig(path?: string): RawConfig {
  if (!path || !existsSync(path)) {
    return {};
  }

  return parseFlatToml(readFileSync(path, "utf8"));
}

function parseFlatToml(source: string): RawConfig {
  const config: RawConfig = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const cleaned = stripInlineTomlComment(line);
    const separatorIndex = cleaned.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const rawKey = cleaned.slice(0, separatorIndex).trim();
    const rawValue = cleaned.slice(separatorIndex + 1).trim();
    const mappedKey = FILE_KEY_MAP[rawKey as keyof typeof FILE_KEY_MAP];

    if (!mappedKey) {
      continue;
    }

    assignRawConfigValue(config, mappedKey, rawValue);
  }

  return config;
}

function readEnvConfig(): RawConfig {
  const config: RawConfig = {};

  for (const [envKey, mappedKey] of Object.entries(ENV_KEY_MAP)) {
    const rawValue = process.env[envKey];
    if (rawValue === undefined) {
      continue;
    }

    assignRawConfigValue(config, mappedKey, rawValue);
  }

  return config;
}

function coerceBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = unquote(value ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function coerceInteger(value: string | undefined, fallback: number): number {
  const normalized = unquote(value ?? "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function coerceString(value: string | undefined): string | undefined {
  const normalized = unquote(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function assignRawConfigValue(
  config: RawConfig,
  key: AppConfigKey,
  value: string
): void {
  Object.assign(config, { [key]: value });
}

function upsertFlatTomlLine(source: string, key: string, assignment: string): string {
  const lines = source.split(/\r?\n/);
  let updated = false;

  const nextLines = lines.map((line) => {
    if (matchesFlatTomlKey(line, key)) {
      updated = true;
      return assignment;
    }

    return line;
  });

  if (!updated) {
    while (nextLines.length > 0 && nextLines.at(-1) === "") {
      nextLines.pop();
    }
    nextLines.push(assignment);
  }

  return nextLines.join("\n").trimEnd().concat("\n");
}

function stripInlineTomlComment(line: string): string {
  const commentIndex = findUnquotedCharacter(line, "#");
  return (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trim();
}

function findUnquotedCharacter(line: string, target: string): number {
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote === "\"") {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }
    }

    if (char === "'" || char === "\"") {
      if (!quote) {
        quote = char;
        continue;
      }

      if (quote === char) {
        quote = undefined;
      }

      continue;
    }

    if (!quote && char === target) {
      return index;
    }
  }

  return -1;
}

function matchesFlatTomlKey(line: string, key: string): boolean {
  return new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(line);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
