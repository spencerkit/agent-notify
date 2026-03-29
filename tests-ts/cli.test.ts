import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import {
  DEFAULT_CONFIG,
  defaultConfigPath,
  formatConfigToml
} from "../src/config.js";

describe("main", () => {
  it("prints the installed package version", async () => {
    let stdout = "";
    const readFile = vi.fn(async (path: string, _encoding: BufferEncoding) => {
      if (path.endsWith("package.json")) {
        return '{"version":"9.9.9"}';
      }

      return "";
    });

    const exitCode = await main(["version"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      },
      readFile
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("9.9.9\n");
    expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/package\.json$/), "utf8");
  });

  it("routes codex handle payloads from an argument", async () => {
    let seenEvent: unknown;
    const notify = vi.fn(async (event: unknown) => {
      seenEvent = event;
      return {
        emitted: true,
        desktopSent: false,
        soundSent: false
      };
    });

    const exitCode = await main(
      [
        "handle",
        "codex",
        '{"type":"agent-turn-complete","thread-id":"thread-1","turn-id":"turn-1","cwd":"/tmp/demo","input-messages":["rename foo"],"last-assistant-message":"rename complete"}'
      ],
      {
        createNotifier: () => ({ notify }),
        createStore: () => ({
          shouldEmit: async () => true,
          record: async () => {}
        })
      }
    );

    expect(exitCode).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(seenEvent).toMatchObject({
      tool: "codex",
      sessionId: "thread-1",
      project: "demo",
      summary: "rename complete"
    });
  });

  it("routes claude handle payloads from stdin with --event", async () => {
    let seenEvent: unknown;
    const notify = vi.fn(async (event: unknown) => {
      seenEvent = event;
      return {
        emitted: true,
        desktopSent: false,
        soundSent: false
      };
    });

    const exitCode = await main(["handle", "claude", "--event", "Notification"], {
      stdin: {
        read: () =>
          '{"session_id":"session-1","cwd":"/tmp/demo","notification_type":"idle_prompt","message":"Claude is waiting"}'
      },
      createNotifier: () => ({ notify }),
      createStore: () => ({
        shouldEmit: async () => true,
        record: async () => {}
      })
    });

    expect(exitCode).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(seenEvent).toMatchObject({
      tool: "claude",
      state: "needs_input",
      sessionId: "session-1",
      summary: "Claude is waiting"
    });
  });

  it("routes claude payloads through the default stdin adapter", async () => {
    let seenEvent: unknown;
    const notify = vi.fn(async (event: unknown) => {
      seenEvent = event;
      return {
        emitted: true,
        desktopSent: false,
        soundSent: false
      };
    });
    const payload =
      '{"session_id":"session-1","cwd":"/tmp/demo","notification_type":"idle_prompt","message":"Claude is waiting"}';

    const setEncodingSpy = vi
      .spyOn(process.stdin, "setEncoding")
      .mockImplementation(() => process.stdin);
    const asyncIteratorSpy = vi
      .spyOn(process.stdin, Symbol.asyncIterator as never)
      .mockImplementation(
        (() =>
          (async function* () {
            yield payload;
          })()) as typeof process.stdin[typeof Symbol.asyncIterator]
      );

    try {
      const firstExitCode = await main(["handle", "claude", "--event", "Notification"], {
        createNotifier: () => ({ notify }),
        createStore: () => ({
          shouldEmit: async () => true,
          record: async () => {}
        })
      });
      const secondExitCode = await main(["handle", "claude", "--event", "Notification"], {
        createNotifier: () => ({ notify }),
        createStore: () => ({
          shouldEmit: async () => true,
          record: async () => {}
        })
      });

      expect(firstExitCode).toBe(0);
      expect(secondExitCode).toBe(0);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(seenEvent).toMatchObject({
        tool: "claude",
        state: "needs_input",
        sessionId: "session-1",
        summary: "Claude is waiting"
      });
      expect(setEncodingSpy).toHaveBeenCalledWith("utf8");
      expect(asyncIteratorSpy).toHaveBeenCalledTimes(2);
    } finally {
      setEncodingSpy.mockRestore();
      asyncIteratorSpy.mockRestore();
    }
  });

  it("install codex --dry-run writes rendered config containing top-level notify", async () => {
    let stdout = "";

    const exitCode = await main(["install", "codex", "--dry-run"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      },
      readFile: async () => 'model = "gpt-5"\n\n[tui]\ntheme = "dark"\n'
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('notify = ["agent-notify", "handle", "codex"]');
    expect(stdout.indexOf("notify =")).toBeGreaterThanOrEqual(0);
    expect(stdout.indexOf("notify =")).toBeLessThan(stdout.indexOf("[tui]"));
  });

  it("install claude --dry-run writes rendered hooks containing Notification, Stop, StopFailure", async () => {
    let stdout = "";

    const exitCode = await main(["install", "claude", "--dry-run"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      },
      readFile: async () => "{}"
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('"Notification"');
    expect(stdout).toContain('"Stop"');
    expect(stdout).toContain('"StopFailure"');
    expect(stdout).toContain("agent-notify handle claude --event Notification");
  });

  it("install codex writes rendered config to disk after creating the parent directory", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    let stdout = "";

    const exitCode = await main(
      ["install", "codex", "--config", "/tmp/demo/nested/config.toml"],
      {
        stdout: {
          write: (chunk) => {
            stdout += chunk;
            return true;
          }
        },
        mkdir,
        writeFile,
        readFile: async () => 'model = "gpt-5"\n'
      }
    );

    expect(exitCode).toBe(0);
    expect(mkdir).toHaveBeenCalledWith("/tmp/demo/nested");
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/demo/nested/config.toml",
      expect.stringContaining('notify = ["agent-notify", "handle", "codex"]'),
      "utf8"
    );
    expect(stdout).toContain('notify = ["agent-notify", "handle", "codex"]');
  });

  it("prints stable TOML defaults for config get when the global config file is missing", async () => {
    let stdout = "";
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });

    const exitCode = await main(["config", "get"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      },
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(stdout).toBe(formatConfigToml(DEFAULT_CONFIG));
  });

  it("prints the existing empty global config file as-is for config get", async () => {
    let stdout = "";
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => "");

    const exitCode = await main(["config", "get"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      },
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(stdout).toBe("");
  });

  it("lists built-in sound themes", async () => {
    let stdout = "";

    const exitCode = await main(["theme", "list"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("subtle");
    expect(stdout).toContain("standard");
    expect(stdout).toContain("urgent");
  });

  it("shows a built-in sound theme", async () => {
    let stdout = "";

    const exitCode = await main(["theme", "show", "standard"], {
      stdout: {
        write: (chunk) => {
          stdout += chunk;
          return true;
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("name: standard");
    expect(stdout).toContain("needs_input");
    expect(stdout).toContain("completed");
    expect(stdout).toContain("failed");
  });

  it("applies a built-in sound theme to the global config", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => "");

    const exitCode = await main(["theme", "apply", "standard"], {
      mkdir,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining('sound_theme = "standard"'),
      "utf8"
    );
  });

  it("rejects extra args for config get", async () => {
    let stderr = "";

    const exitCode = await main(["config", "get", "extra"], {
      stderr: {
        write: (chunk) => {
          stderr += chunk;
          return true;
        }
      },
      readFile: async () => ""
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("usage: agent-notify config <get|set|unset> ...");
  });

  it("writes sound_file with config set sound-file", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => "");

    const exitCode = await main(["config", "set", "sound-file", "/tmp/ding.wav"], {
      mkdir,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining('sound_file = "/tmp/ding.wav"'),
      "utf8"
    );
  });

  it("writes sound_file_needs_input with config set sound-file-needs-input", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => "");

    const exitCode = await main(
      ["config", "set", "sound-file-needs-input", "/tmp/input.wav"],
      {
        mkdir,
        writeFile,
        readFile
      }
    );

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining('sound_file_needs_input = "/tmp/input.wav"'),
      "utf8"
    );
  });

  it("writes notify_completed with config set notify-completed false", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => "");

    const exitCode = await main(["config", "set", "notify-completed", "false"], {
      mkdir,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining("notify_completed = false"),
      "utf8"
    );
  });

  it("rejects extra args for config set sound-file", async () => {
    let stderr = "";

    const exitCode = await main(
      ["config", "set", "sound-file", "/tmp/ding.wav", "extra"],
      {
        stderr: {
          write: (chunk) => {
            stderr += chunk;
            return true;
          }
        },
        readFile: async () => ""
      }
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain("usage: agent-notify config <get|set|unset> ...");
  });

  it("rejects invalid boolean values for config set notify-completed", async () => {
    let stderr = "";

    const exitCode = await main(["config", "set", "notify-completed", "maybe"], {
      stderr: {
        write: (chunk) => {
          stderr += chunk;
          return true;
        }
      },
      readFile: async () => ""
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("invalid boolean value");
  });

  it("rejects unknown sound themes", async () => {
    let stderr = "";

    const exitCode = await main(["theme", "apply", "loud"], {
      stderr: {
        write: (chunk) => {
          stderr += chunk;
          return true;
        }
      },
      readFile: async () => ""
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("unknown theme");
  });

  it("removes only sound_file_failed with config unset sound-file-failed", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const unlink = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () =>
      [
        'sound_file = "/tmp/default.wav"',
        'sound_file_failed = "/tmp/failed.wav"',
        "sound_enabled = true"
      ].join("\n")
    );

    const exitCode = await main(["config", "unset", "sound-file-failed"], {
      mkdir,
      unlink,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(unlink).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      'sound_file = "/tmp/default.wav"\nsound_enabled = true',
      "utf8"
    );
  });

  it("removes only notify_failed with config unset notify-failed", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const unlink = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () =>
      [
        "notify_completed = false",
        "notify_failed = true",
        'sound_file = "/tmp/default.wav"'
      ].join("\n")
    );

    const exitCode = await main(["config", "unset", "notify-failed"], {
      mkdir,
      unlink,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(unlink).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      'notify_completed = false\nsound_file = "/tmp/default.wav"',
      "utf8"
    );
  });

  it("removes only sound_file with config unset sound-file", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const unlink = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () =>
      [
        "desktop_enabled = false",
        'sound_file = "/tmp/ding.wav"',
        "sound_enabled = true"
      ].join("\n")
    );

    const exitCode = await main(["config", "unset", "sound-file"], {
      mkdir,
      unlink,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).toHaveBeenCalledWith(dirname(configPath));
    expect(unlink).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      configPath,
      "desktop_enabled = false\nsound_enabled = true",
      "utf8"
    );
  });

  it("does not create or remove anything when config unset sound-file targets a missing global config file", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const unlink = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });

    const exitCode = await main(["config", "unset", "sound-file"], {
      mkdir,
      unlink,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("removes the global config file when config unset sound-file removes the last key", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const unlink = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => 'sound_file = "/tmp/ding.wav"\n');

    const exitCode = await main(["config", "unset", "sound-file"], {
      mkdir,
      unlink,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).not.toHaveBeenCalled();
    expect(unlink).toHaveBeenCalledWith(configPath);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("removes an existing empty global config file on config unset sound-file", async () => {
    const mkdir = vi.fn(async (_path: string) => {});
    const unlink = vi.fn(async (_path: string) => {});
    const writeFile = vi.fn(
      async (_path: string, _content: string, _encoding: BufferEncoding) => {}
    );
    const configPath = defaultConfigPath();
    const readFile = vi.fn(async () => "");

    const exitCode = await main(["config", "unset", "sound-file"], {
      mkdir,
      unlink,
      writeFile,
      readFile
    });

    expect(exitCode).toBe(0);
    expect(readFile).toHaveBeenCalledWith(configPath, "utf8");
    expect(mkdir).not.toHaveBeenCalled();
    expect(unlink).toHaveBeenCalledWith(configPath);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects extra args for config unset sound-file", async () => {
    let stderr = "";

    const exitCode = await main(["config", "unset", "sound-file", "extra"], {
      stderr: {
        write: (chunk) => {
          stderr += chunk;
          return true;
        }
      },
      readFile: async () => ""
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("usage: agent-notify config <get|set|unset> ...");
  });

  it("returns non-zero for invalid CLI input", async () => {
    let stderr = "";

    const exitCode = await main(["handle", "claude"], {
      stderr: {
        write: (chunk) => {
          stderr += chunk;
          return true;
        }
      }
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/event|usage|missing/i);
  });
});
