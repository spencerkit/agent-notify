#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CONFIG,
  defaultConfigPath,
  defaultStateDir,
  formatConfigToml,
  loadConfig,
  setFlatTomlString,
  unsetFlatTomlKey
} from "./config.js";
import { parseEvent } from "./events.js";
import {
  buildClaudeCommandPrefix,
  buildCodexNotifyCommand,
  patchClaudeSettings,
  patchCodexConfig
} from "./installers.js";
import { Notifier } from "./notifier.js";
import { EventStore } from "./store.js";

type Tool = "codex" | "claude";

interface StreamLike {
  write(chunk: string): boolean;
}

interface StdinLike {
  read(): string | Promise<string> | null;
}

interface StoreLike {
  shouldEmit(event: ReturnType<typeof parseEvent>): Promise<boolean>;
  record(event: ReturnType<typeof parseEvent>): Promise<void>;
}

interface NotifierLike {
  notify(event: ReturnType<typeof parseEvent>): Promise<unknown>;
}

export interface MainDependencies {
  stdin?: StdinLike;
  stdout?: StreamLike;
  stderr?: StreamLike;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile?: (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
  createStore?: (stateDir: string, cwd: string) => StoreLike;
  createNotifier?: (tool: Tool, cwd: string, stateDir: string) => NotifierLike;
}

const DEFAULT_CODEX_CONFIG_PATH = join(homedir(), ".codex", "config.toml");
const DEFAULT_CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: MainDependencies = {}
): Promise<number> {
  const io = createRuntime(dependencies);

  if (process.env.AGENT_NOTIFY_SMOKE_SIGNAL === "1" && argv.length === 0) {
    io.stdout.write("agent-notify:main-ran\n");
  }

  if (argv.length === 0) {
    return 0;
  }

  try {
    const [command, ...rest] = argv;

    if (command === "handle") {
      return await handleCommand(rest, io);
    }

    if (command === "install") {
      return await installCommand(rest, io);
    }

    if (command === "config") {
      return await configCommand(rest, io);
    }

    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    io.stderr.write(`${toMessage(error)}\n`);
    return 1;
  }
}

async function handleCommand(
  argv: readonly string[],
  runtime: Required<MainDependencies>
): Promise<number> {
  const source = argv[0];

  if (source !== "codex" && source !== "claude") {
    throw new Error("usage: agent-notify handle <codex|claude> ...");
  }

  const options = parseHandleOptions(source, argv.slice(1));
  const payloadText = (await readPayloadText(options.payload, runtime.stdin)).trim();

  if (!payloadText) {
    throw new Error("missing JSON payload");
  }

  const payloadData = parseJsonObject(payloadText);
  const event = parseEvent(source, payloadData, options.eventName);
  const stateDir = options.stateDir ?? defaultStateDir();
  const notifier =
    runtime.createNotifier?.(source, event.cwd, stateDir) ??
    new Notifier({
      config: loadConfig(event.cwd),
      store:
        runtime.createStore?.(stateDir, event.cwd) ??
        new EventStore(stateDir, configToStoreOptions(loadConfig(event.cwd)))
    });

  await notifier.notify(event);
  return 0;
}

function isDirectExecution(): boolean {
  const entryArg = process.argv[1];

  if (!entryArg) {
    return false;
  }

  try {
    return realpathSync(entryArg) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

async function installCommand(
  argv: readonly string[],
  runtime: Required<MainDependencies>
): Promise<number> {
  const target = argv[0];

  if (target !== "codex" && target !== "claude") {
    throw new Error("usage: agent-notify install <codex|claude> ...");
  }

  const options = parseInstallOptions(target, argv.slice(1));
  const path = target === "codex" ? options.path ?? DEFAULT_CODEX_CONFIG_PATH : options.path ?? DEFAULT_CLAUDE_SETTINGS_PATH;
  const currentText = await readExistingText(path, runtime.readFile);
  const updatedText =
    target === "codex"
      ? patchCodexConfig(currentText, buildCodexNotifyCommand("agent-notify"))
      : patchClaudeSettings(currentText, buildClaudeCommandPrefix("agent-notify"));

  if (options.dryRun) {
    runtime.stdout.write(updatedText);
    return 0;
  }

  await runtime.mkdir(dirname(path));
  await runtime.writeFile(path, updatedText, "utf8");
  runtime.stdout.write(updatedText);
  return 0;
}

async function configCommand(
  argv: readonly string[],
  runtime: Required<MainDependencies>
): Promise<number> {
  const configPath = defaultConfigPath();
  const [action, key, value] = argv;
  const usage = "usage: agent-notify config <get|set|unset> ...";

  if (action === "get") {
    if (argv.length !== 1) {
      throw new Error(usage);
    }

    const current = await readOptionalText(configPath, runtime.readFile);
    runtime.stdout.write(current ?? formatConfigToml(DEFAULT_CONFIG));
    return 0;
  }

  if (action === "set" && key === "sound-file" && value !== undefined) {
    if (argv.length !== 3) {
      throw new Error(usage);
    }

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
    if (argv.length !== 2) {
      throw new Error(usage);
    }

    const current = await readOptionalText(configPath, runtime.readFile);
    if (current === undefined) {
      return 0;
    }

    const next = unsetFlatTomlKey(current, "sound_file");
    if (next.trim().length === 0) {
      await runtime.unlink(configPath);
      return 0;
    }

    await runtime.mkdir(dirname(configPath));
    await runtime.writeFile(configPath, next, "utf8");
    return 0;
  }

  throw new Error(usage);
}

function parseHandleOptions(
  source: Tool,
  argv: readonly string[]
): {
  eventName?: string;
  payload?: string;
  stateDir?: string;
} {
  let eventName: string | undefined;
  let payload: string | undefined;
  let stateDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--event") {
      eventName = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--state-dir") {
      stateDir = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    }

    if (payload !== undefined) {
      throw new Error("unexpected extra argument");
    }

    payload = arg;
  }

  if (source === "claude" && !eventName) {
    throw new Error("missing required option: --event");
  }

  return { eventName, payload, stateDir };
}

function parseInstallOptions(
  target: Tool,
  argv: readonly string[]
): {
  dryRun: boolean;
  path?: string;
} {
  let dryRun = false;
  let path: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (target === "codex" && arg === "--config") {
      path = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (target === "claude" && arg === "--settings") {
      path = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  return { dryRun, path };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`missing value for ${flag}`);
  }

  return value;
}

async function readPayloadText(
  explicitPayload: string | undefined,
  stdin: StdinLike
): Promise<string> {
  if (explicitPayload !== undefined) {
    return explicitPayload;
  }

  return (await stdin.read()) ?? "";
}

async function readExistingText(
  path: string,
  readText: Required<MainDependencies>["readFile"]
): Promise<string> {
  return (await readOptionalText(path, readText)) ?? "";
}

async function readOptionalText(
  path: string,
  readText: Required<MainDependencies>["readFile"]
): Promise<string | undefined> {
  try {
    return await readText(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

function parseJsonObject(payloadText: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(payloadText);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON payload must be an object");
  }

  return parsed as Record<string, unknown>;
}

function configToStoreOptions(config: ReturnType<typeof loadConfig>) {
  return {
    dedupeSeconds: config.dedupeSeconds,
    maxEntries: config.maxLogEntries,
    maxAgeDays: config.maxLogAgeDays
  };
}

function createRuntime(dependencies: MainDependencies): Required<MainDependencies> {
  return {
    stdin: dependencies.stdin ?? {
      read: async () => {
        let payload = "";

        process.stdin.setEncoding("utf8");

        for await (const chunk of process.stdin) {
          payload += typeof chunk === "string" ? chunk : String(chunk);
        }

        return payload;
      }
    },
    stdout: dependencies.stdout ?? process.stdout,
    stderr: dependencies.stderr ?? process.stderr,
    readFile: dependencies.readFile ?? readFile,
    writeFile: dependencies.writeFile ?? writeFile,
    unlink: dependencies.unlink ?? unlink,
    mkdir:
      dependencies.mkdir ??
      (async (path) => {
        await mkdir(path, { recursive: true });
      }),
    createStore: dependencies.createStore ?? ((stateDir, cwd) => {
      const config = loadConfig(cwd);
      return new EventStore(stateDir, configToStoreOptions(config));
    }),
    createNotifier: dependencies.createNotifier ?? ((tool, cwd, stateDir) => {
      const config = loadConfig(cwd);
      const store =
        dependencies.createStore?.(stateDir, cwd) ??
        new EventStore(stateDir, configToStoreOptions(config));

      return new Notifier({
        config,
        store
      });
    })
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (isDirectExecution()) {
  void main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      process.stderr.write(`${toMessage(error)}\n`);
      process.exitCode = 1;
    }
  );
}
