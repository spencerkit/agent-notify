import { describe, expect, it } from "vitest";
import { DesktopProvider, SoundProvider } from "../src/providers.js";
import { Notifier } from "../src/notifier.js";
import { makeEvent } from "./test-helpers.js";

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

  it("uses desktop and sound providers for failed events", async () => {
    const calls = { desktop: 0, sound: 0 };
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
      desktopProvider: {
        send: async () => {
          calls.desktop += 1;
          return true;
        }
      },
      soundProvider: {
        send: async () => {
          calls.sound += 1;
          return true;
        }
      }
    });

    const result = await notifier.notify(makeEvent({ state: "failed" }));

    expect(result).toEqual({
      emitted: true,
      desktopSent: true,
      soundSent: true
    });
    expect(calls).toEqual({ desktop: 1, sound: 1 });
  });

  it("returns emitted false and skips providers for deduped events", async () => {
    const calls = { desktop: 0, sound: 0, record: 0 };
    const notifier = new Notifier({
      config: {
        desktopEnabled: true,
        soundEnabled: true,
        soundOnCompleted: true,
        dedupeSeconds: 15,
        maxLogEntries: 10,
        maxLogAgeDays: 7,
        summaryLength: 180
      },
      store: {
        shouldEmit: async () => false,
        record: async () => {
          calls.record += 1;
        }
      },
      desktopProvider: {
        send: async () => {
          calls.desktop += 1;
          return true;
        }
      },
      soundProvider: {
        send: async () => {
          calls.sound += 1;
          return true;
        }
      }
    });

    const result = await notifier.notify(makeEvent({ state: "failed" }));

    expect(result).toEqual({
      emitted: false,
      desktopSent: false,
      soundSent: false
    });
    expect(calls).toEqual({ desktop: 0, sound: 0, record: 0 });
  });

  it("swallows provider failures and still records the event", async () => {
    let recorded = 0;
    const notifier = new Notifier({
      config: {
        desktopEnabled: true,
        soundEnabled: true,
        soundOnCompleted: true,
        dedupeSeconds: 15,
        maxLogEntries: 10,
        maxLogAgeDays: 7,
        summaryLength: 180
      },
      store: {
        shouldEmit: async () => true,
        record: async () => {
          recorded += 1;
        }
      },
      desktopProvider: {
        send: async () => {
          throw new Error("desktop failed");
        }
      },
      soundProvider: {
        send: async () => {
          throw new Error("sound failed");
        }
      }
    });

    await expect(notifier.notify(makeEvent({ state: "failed" }))).resolves.toEqual({
      emitted: true,
      desktopSent: false,
      soundSent: false
    });
    expect(recorded).toBe(1);
  });
});

describe("providers", () => {
  it("uses osascript for desktop notifications when available", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new DesktopProvider({
      commandExists: (command) => command === "osascript",
      run: async (command) => {
        commands.push(command);
        return { ok: true };
      }
    });

    const sent = await provider.send(
      makeEvent({ tool: "claude", state: "failed", project: "demo", summary: "Needs attention" })
    );

    expect(sent).toBe(true);
    expect(commands).toEqual([
      [
        "osascript",
        "-e",
        'display notification "Needs attention" with title "[claude] demo · failed"'
      ]
    ]);
  });

  it("uses notify-send when osascript is unavailable", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new DesktopProvider({
      commandExists: (command) => command === "notify-send",
      run: async (command) => {
        commands.push(command);
        return { ok: true };
      }
    });

    const sent = await provider.send(
      makeEvent({ tool: "claude", state: "failed", project: "demo", summary: "Needs attention" })
    );

    expect(sent).toBe(true);
    expect(commands).toEqual([["notify-send", "[claude] demo · failed", "Needs attention"]]);
  });

  it("prefers powershell.exe when running in WSL even if Unix desktop commands are available", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new DesktopProvider({
      commandExists: (command) =>
        command === "powershell.exe" || command === "osascript" || command === "notify-send",
      run: async (command) => {
        commands.push(command);
        return { ok: true };
      },
      isWsl: () => true
    });

    const sent = await provider.send(
      makeEvent({ tool: "claude", state: "failed", project: "demo", summary: "Needs attention" })
    );

    expect(sent).toBe(true);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.[0]).toBe("powershell.exe");
    expect(commands[0]?.[1]).toBe("-NoProfile");
    expect(commands[0]?.[2]).toBe("-Command");
    expect(commands[0]?.[3]).toContain("ToastNotificationManager");
    expect(commands[0]?.[3]).toContain("[claude] demo · failed");
    expect(commands[0]?.[3]).toContain("Needs attention");
  });

  it("uses PowerShell toast delivery on native Windows ahead of Unix desktop commands", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new DesktopProvider({
      platform: "win32",
      commandExists: (command) =>
        command === "powershell.exe" || command === "osascript" || command === "notify-send",
      run: async (command) => {
        commands.push(command);
        return { ok: true };
      },
      isWsl: () => false
    });

    const sent = await provider.send(
      makeEvent({ tool: "claude", state: "failed", project: "demo", summary: "Needs attention" })
    );

    expect(sent).toBe(true);
    expect(commands[0]?.[0]).toBe("powershell.exe");
    expect(commands[0]?.[3]).toContain("ToastNotificationManager");
  });

  it("uses notify-send when osascript fails at runtime", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new DesktopProvider({
      commandExists: (command) => command === "osascript" || command === "notify-send",
      run: async (command) => {
        commands.push(command);
        if (command[0] === "osascript") {
          throw new Error("osascript failed");
        }
        return { ok: true };
      }
    });

    const sent = await provider.send(
      makeEvent({ tool: "claude", state: "failed", project: "demo", summary: "Needs attention" })
    );

    expect(sent).toBe(true);
    expect(commands).toEqual([
      [
        "osascript",
        "-e",
        'display notification "Needs attention" with title "[claude] demo · failed"'
      ],
      ["notify-send", "[claude] demo · failed", "Needs attention"]
    ]);
  });

  it("falls back to BEL sound output when no preferred sound command is available", async () => {
    const writes: string[] = [];
    const provider = new SoundProvider({
      commandExists: () => false,
      writeTerminalBell: async () => {
        writes.push("tty");
      },
      writeStdoutBell: async () => {
        writes.push("stdout");
      }
    });

    const sent = await provider.send(makeEvent({ state: "failed" }));

    expect(sent).toBe(true);
    expect(writes).toEqual(["tty"]);
  });

  it("continues to a later sound command when a preferred command fails", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new SoundProvider({
      commandExists: (command) => command === "paplay" || command === "aplay",
      run: async (command) => {
        commands.push(command);
        if (command[0] === "paplay") {
          throw new Error("paplay failed");
        }
        return { ok: true };
      }
    });

    const sent = await provider.send(makeEvent({ state: "failed" }));

    expect(sent).toBe(true);
    expect(commands).toEqual([
      ["paplay", "/usr/share/sounds/freedesktop/stereo/complete.oga"],
      ["aplay", "/usr/share/sounds/alsa/Front_Center.wav"]
    ]);
  });

  it("uses powershell.exe for sound when running in WSL and Linux sound commands are unavailable", async () => {
    const commands: Array<readonly string[]> = [];
    const provider = new SoundProvider({
      commandExists: (command) => command === "powershell.exe",
      run: async (command) => {
        commands.push(command);
        return { ok: true };
      },
      isWsl: () => true
    });

    const sent = await provider.send(makeEvent({ state: "failed" }));

    expect(sent).toBe(true);
    expect(commands).toEqual([
      ["powershell.exe", "-NoProfile", "-Command", "[console]::beep(880,200)"]
    ]);
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
      },
      isWsl: () => false
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

  it("falls back to stdout BEL when the TTY BEL write fails", async () => {
    const writes: string[] = [];
    const provider = new SoundProvider({
      commandExists: () => false,
      writeTerminalBell: async () => {
        writes.push("tty");
        throw new Error("tty unavailable");
      },
      writeStdoutBell: async () => {
        writes.push("stdout");
        writes.push("\u0007");
      }
    });

    const sent = await provider.send(makeEvent({ state: "failed" }));

    expect(sent).toBe(true);
    expect(writes).toEqual(["tty", "stdout", "\u0007"]);
  });
});
