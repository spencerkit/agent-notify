import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

describe("main", () => {
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
