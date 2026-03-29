import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { delimiter, join } from "node:path";
import type { NormalizedEvent, NormalizedState } from "./events.js";
import { resolveThemeSoundFile } from "./sound-themes.js";

export interface DeliveryProvider {
  send(event: NormalizedEvent): Promise<boolean>;
}

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
  soundTheme?: string;
  stateSoundFiles?: Partial<Record<NormalizedState, string>>;
}

export class DesktopProvider implements DeliveryProvider {
  private readonly commandExists: Required<DesktopProviderOptions>["commandExists"];
  private readonly run: Required<DesktopProviderOptions>["run"];
  private readonly isWsl: Required<DesktopProviderOptions>["isWsl"];
  private readonly platform: NodeJS.Platform;

  constructor(options: DesktopProviderOptions = {}) {
    this.commandExists = options.commandExists ?? commandAvailable;
    this.run = options.run ?? runCommand;
    this.isWsl = options.isWsl ?? defaultIsWsl;
    this.platform = options.platform ?? process.platform;
  }

  async send(event: NormalizedEvent): Promise<boolean> {
    const title = formatNotificationTitle(event);

    if (
      (this.platform === "win32" || this.isWsl()) &&
      (await this.commandExists("powershell.exe"))
    ) {
      const sent = await this.execute([
        "powershell.exe",
        "-NoProfile",
        "-Command",
        buildWindowsToastScript(title, event.summary)
      ]);
      if (sent) {
        return true;
      }
    }

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
  private readonly isWsl: Required<SoundProviderOptions>["isWsl"];
  private readonly platform: NodeJS.Platform;
  private readonly soundFile?: string;
  private readonly soundTheme?: string;
  private readonly stateSoundFiles: Partial<Record<NormalizedState, string>>;

  constructor(options: SoundProviderOptions = {}) {
    this.commandExists = options.commandExists ?? commandAvailable;
    this.run = options.run ?? runCommand;
    this.writeTerminalBell = options.writeTerminalBell ?? defaultWriteTerminalBell;
    this.writeStdoutBell = options.writeStdoutBell ?? defaultWriteStdoutBell;
    this.isWsl = options.isWsl ?? defaultIsWsl;
    this.platform = options.platform ?? process.platform;
    this.soundFile = options.soundFile;
    this.soundTheme = options.soundTheme;
    this.stateSoundFiles = options.stateSoundFiles ?? {};
  }

  async send(event: NormalizedEvent): Promise<boolean> {
    const soundFile = resolveSoundFile(
      event.state,
      this.stateSoundFiles,
      this.soundTheme,
      this.soundFile
    );

    if (
      soundFile &&
      (this.platform === "win32" || this.isWsl()) &&
      (await this.commandExists("powershell.exe"))
    ) {
      const windowsSoundFile = toWindowsReadableSoundPath(soundFile, this.isWsl());
      const sent = await this.execute([
        "powershell.exe",
        "-NoProfile",
        "-Command",
        buildWindowsSoundScript(windowsSoundFile)
      ]);
      if (sent) {
        return true;
      }
    }

    for (const command of getSoundCommands(soundFile)) {
      if (!(await this.commandExists(command.name))) {
        continue;
      }

      const sent = await this.execute(command.args);
      if (sent) {
        return true;
      }
    }

    if ((this.platform === "win32" || this.isWsl()) && (await this.commandExists("powershell.exe"))) {
      const sent = await this.execute([
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "[console]::beep(880,200)"
      ]);
      if (sent) {
        return true;
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

  private async execute(command: readonly string[]): Promise<boolean> {
    try {
      const result = await this.run(command);
      return result.ok;
    } catch {
      return false;
    }
  }
}

const DEFAULT_SOUND_COMMANDS = [
  { name: "osascript", args: ["osascript", "-e", "beep 1"] },
  { name: "paplay", args: ["paplay", "/usr/share/sounds/freedesktop/stereo/complete.oga"] },
  { name: "aplay", args: ["aplay", "/usr/share/sounds/alsa/Front_Center.wav"] },
  { name: "afplay", args: ["afplay", "/System/Library/Sounds/Glass.aiff"] }
] as const;

function getSoundCommands(soundFile?: string): readonly {
  readonly name: string;
  readonly args: readonly string[];
}[] {
  if (!soundFile) {
    return DEFAULT_SOUND_COMMANDS;
  }

  return [
    { name: "paplay", args: ["paplay", soundFile] },
    { name: "aplay", args: ["aplay", soundFile] },
    { name: "afplay", args: ["afplay", soundFile] }
  ];
}

function resolveSoundFile(
  state: NormalizedState,
  stateSoundFiles: Partial<Record<NormalizedState, string>>,
  soundTheme: string | undefined,
  soundFile?: string
): string | undefined {
  return stateSoundFiles[state] ?? resolveThemeSoundFile(soundTheme, state) ?? soundFile;
}

export function formatNotificationTitle(event: Pick<NormalizedEvent, "tool" | "project" | "state">): string {
  return `[${event.tool}] ${event.project} · ${event.state}`;
}

async function commandAvailable(command: string): Promise<boolean> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return false;
  }

  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue;
    }

    try {
      await access(join(directory, command), fsConstants.X_OK);
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

function defaultIsWsl(): boolean {
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function buildWindowsToastScript(title: string, summary: string): string {
  const xml = [
    "<toast>",
    "  <visual>",
    '    <binding template="ToastGeneric">',
    `      <text>${escapeXml(title)}</text>`,
    `      <text>${escapeXml(summary)}</text>`,
    "    </binding>",
    "  </visual>",
    "</toast>"
  ].join("");

  return [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    `$xml.LoadXml('${escapePowerShellSingleQuotedString(xml)}')`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('agent-notify')",
    "$notifier.Show($toast)"
  ].join("; ");
}

function buildWindowsSoundScript(soundFile: string): string {
  const innerScript = [
    `$player = New-Object System.Media.SoundPlayer '${escapePowerShellSingleQuotedString(soundFile)}'`,
    "$player.PlaySync()"
  ].join("; ");
  const launchCommand = [
    "Start-Process powershell.exe",
    "-WindowStyle Hidden",
    "-ErrorAction Stop",
    `-ArgumentList @('-NoProfile', '-Command', '${escapePowerShellSingleQuotedString(innerScript)}')`
  ].join(" ");

  return [
    "$ErrorActionPreference = 'Stop'",
    `$soundFile = '${escapePowerShellSingleQuotedString(soundFile)}'`,
    "if (-not (Test-Path -LiteralPath $soundFile -PathType Leaf)) { throw 'Sound file not found' }",
    "$player = New-Object System.Media.SoundPlayer $soundFile",
    "$player.Load()",
    launchCommand
  ].join("; ");
}

function toWindowsReadableSoundPath(soundFile: string, isWsl: boolean): string {
  if (!isWsl || looksLikeWindowsPath(soundFile)) {
    return soundFile;
  }

  const mountedDriveMatch = soundFile.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (mountedDriveMatch) {
    const [, driveLetter, relativePath] = mountedDriveMatch;
    return `${driveLetter.toUpperCase()}:\\${relativePath.replaceAll("/", "\\")}`;
  }

  const distroName = process.env.WSL_DISTRO_NAME;
  if (!distroName) {
    return soundFile;
  }

  return `\\\\wsl.localhost\\${distroName}${soundFile.replaceAll("/", "\\")}`;
}

function looksLikeWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || value.startsWith("\\\\");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function escapePowerShellSingleQuotedString(value: string): string {
  return value.replaceAll("'", "''");
}
