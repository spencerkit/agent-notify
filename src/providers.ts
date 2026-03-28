import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import type { NormalizedEvent } from "./events.js";

export interface DeliveryProvider {
  send(event: NormalizedEvent): Promise<boolean>;
}

export interface DesktopProviderOptions {
  commandExists?: (command: string) => boolean | Promise<boolean>;
  run?: (command: readonly string[]) => Promise<{ ok: boolean }>;
}

export interface SoundProviderOptions {
  commandExists?: (command: string) => boolean | Promise<boolean>;
  run?: (command: readonly string[]) => Promise<{ ok: boolean }>;
  writeTerminalBell?: () => void | Promise<void>;
  writeStdoutBell?: () => void | Promise<void>;
}

export class DesktopProvider implements DeliveryProvider {
  private readonly commandExists: Required<DesktopProviderOptions>["commandExists"];
  private readonly run: Required<DesktopProviderOptions>["run"];

  constructor(options: DesktopProviderOptions = {}) {
    this.commandExists = options.commandExists ?? commandAvailable;
    this.run = options.run ?? runCommand;
  }

  async send(event: NormalizedEvent): Promise<boolean> {
    const title = formatNotificationTitle(event);

    if (await this.commandExists("osascript")) {
      const sent = await this.execute([
        "osascript",
        "-e",
        `display notification "${escapeAppleScriptString(event.summary)}" with title "${escapeAppleScriptString(title)}"`
      ]);
      if (sent) {
        return true;
      }
    }

    if (await this.commandExists("notify-send")) {
      return this.execute(["notify-send", title, event.summary]);
    }

    return false;
  }

  private async execute(command: readonly string[]): Promise<boolean> {
    try {
      const result = await this.run(command);
      return result.ok;
    } catch {
      return false;
    }
  }
}

export class SoundProvider implements DeliveryProvider {
  private readonly commandExists: Required<SoundProviderOptions>["commandExists"];
  private readonly run: Required<SoundProviderOptions>["run"];
  private readonly writeTerminalBell: Required<SoundProviderOptions>["writeTerminalBell"];
  private readonly writeStdoutBell: Required<SoundProviderOptions>["writeStdoutBell"];

  constructor(options: SoundProviderOptions = {}) {
    this.commandExists = options.commandExists ?? commandAvailable;
    this.run = options.run ?? runCommand;
    this.writeTerminalBell = options.writeTerminalBell ?? defaultWriteTerminalBell;
    this.writeStdoutBell = options.writeStdoutBell ?? defaultWriteStdoutBell;
  }

  async send(_event: NormalizedEvent): Promise<boolean> {
    for (const command of SOUND_COMMANDS) {
      if (!(await this.commandExists(command.name))) {
        continue;
      }

      try {
        const result = await this.run(command.args);
        if (result.ok) {
          return true;
        }
      } catch {
        continue;
      }
    }

    try {
      await this.writeTerminalBell();
      return true;
    } catch {
      try {
        await this.writeStdoutBell();
        return true;
      } catch {
        return false;
      }
    }
  }
}

const SOUND_COMMANDS = [
  { name: "osascript", args: ["osascript", "-e", "beep 1"] },
  { name: "paplay", args: ["paplay", "/usr/share/sounds/freedesktop/stereo/complete.oga"] },
  { name: "aplay", args: ["aplay", "/usr/share/sounds/alsa/Front_Center.wav"] },
  { name: "afplay", args: ["afplay", "/System/Library/Sounds/Glass.aiff"] }
] as const;

export function formatNotificationTitle(event: Pick<NormalizedEvent, "tool" | "project" | "state">): string {
  return `[${event.tool}] ${event.project} · ${event.state}`;
}

async function commandAvailable(command: string): Promise<boolean> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return false;
  }

  for (const directory of pathValue.split(":")) {
    if (!directory) {
      continue;
    }

    try {
      await access(`${directory}/${command}`, fsConstants.X_OK);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function runCommand(command: readonly string[]): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    execFile(command[0], command.slice(1), { timeout: 2000 }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ ok: true });
    });
  });
}

async function defaultWriteTerminalBell(): Promise<void> {
  const { open } = await import("node:fs/promises");
  const handle = await open("/dev/tty", "w");
  try {
    await handle.writeFile("\u0007", "utf8");
  } finally {
    await handle.close();
  }
}

async function defaultWriteStdoutBell(): Promise<void> {
  process.stdout.write("\u0007");
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n");
}
