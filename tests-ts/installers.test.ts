import { describe, expect, it } from "vitest";
import { patchClaudeSettings, patchCodexConfig } from "../src/installers.js";

describe("patchCodexConfig", () => {
  it("keeps notify at top level before TOML tables", () => {
    const updated = patchCodexConfig('model = "gpt-5"\n\n[tui]\ntheme = "dark"\n', [
      "node",
      "dist/cli.js",
      "handle",
      "codex"
    ]);

    expect(updated.indexOf("notify =")).toBeLessThan(updated.indexOf("[tui]"));
  });

  it("replaces an existing notify assignment without duplicates", () => {
    const updated = patchCodexConfig(
      'model = "gpt-5"\nnotify = ["old", "command"]\n',
      ["agent-notify", "handle", "codex"]
    );

    expect(updated).toContain('notify = ["agent-notify", "handle", "codex"]');
    expect(updated).not.toContain('"old"');
    expect(updated.match(/^notify =/gm)).toHaveLength(1);
  });

  it("replaces an existing multiline notify array without duplicates", () => {
    const updated = patchCodexConfig(
      'model = "gpt-5"\nnotify = [\n  "old",\n  "command"\n]\n',
      ["agent-notify", "handle", "codex"]
    );

    expect(updated).toContain('notify = ["agent-notify", "handle", "codex"]');
    expect(updated).not.toContain('"old"');
    expect(updated.match(/^notify =/gm)).toHaveLength(1);
    expect(updated).not.toContain(']\n]');
  });

  it("replaces a top-level notify array that uses single-quoted TOML strings", () => {
    const updated = patchCodexConfig(
      "model = \"gpt-5\"\nnotify = [ 'o]ld', 'cmd' ]\n",
      ["agent-notify", "handle", "codex"]
    );

    expect(updated).toContain('notify = ["agent-notify", "handle", "codex"]');
    expect(updated).not.toContain("'o]ld'");
    expect(updated).not.toContain("'cmd'");
    expect(updated.match(/^notify =/gm)).toHaveLength(1);
  });

  it("replaces an existing notify array that uses single-quoted TOML strings", () => {
    const updated = patchCodexConfig(
      "notify = [ 'o]ld', 'cmd' ]\n",
      ["agent-notify", "handle", "codex"]
    );

    expect(updated).toBe('notify = ["agent-notify", "handle", "codex"]\n');
  });

  it("fails explicitly for an unterminated top-level notify array", () => {
    expect(() =>
      patchCodexConfig(
        'model = "gpt-5"\nnotify = [\n  "old",\n  "command"\n',
        ["agent-notify", "handle", "codex"]
      )
    ).toThrow(/notify/i);
  });

  it("fails explicitly when notify already exists under a TOML table", () => {
    expect(() =>
      patchCodexConfig(
        'model = "gpt-5"\n\n[tui]\nnotify = ["old", "command"]\ntheme = "dark"\n',
        ["agent-notify", "handle", "codex"]
      )
    ).toThrow(/notify/i);
  });

  it("fails explicitly when both top-level and table-scoped notify assignments exist", () => {
    expect(() =>
      patchCodexConfig(
        'model = "gpt-5"\nnotify = ["top", "level"]\n\n[tui]\nnotify = ["table", "scoped"]\n',
        ["agent-notify", "handle", "codex"]
      )
    ).toThrow(/notify/i);
  });
});

describe("patchClaudeSettings", () => {
  it("adds Notification, Stop, and StopFailure hooks", () => {
    const updated = patchClaudeSettings("{}", ["agent-notify"]);
    const parsed = JSON.parse(updated);

    expect(parsed.hooks.Notification[0].matcher).toBe(
      "permission_prompt|idle_prompt|elicitation_dialog"
    );
    expect(parsed.hooks.Notification[0].hooks[0]).toEqual({
      type: "command",
      command: "agent-notify handle claude --event Notification"
    });
    expect(parsed.hooks.Stop[0].hooks[0]).toEqual({
      type: "command",
      command: "agent-notify handle claude --event Stop"
    });
    expect(parsed.hooks.StopFailure[0].hooks[0]).toEqual({
      type: "command",
      command: "agent-notify handle claude --event StopFailure"
    });
  });

  it("treats whitespace-only settings as an empty object", () => {
    const updated = patchClaudeSettings("  \n\t", ["agent-notify"]);
    const parsed = JSON.parse(updated);

    expect(parsed.hooks.Notification[0].hooks[0].command).toBe(
      "agent-notify handle claude --event Notification"
    );
  });

  it("preserves unrelated existing JSON fields", () => {
    const updated = patchClaudeSettings(
      JSON.stringify({
        theme: "dark",
        nested: { enabled: true },
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "existing" }] }]
        }
      }),
      ["agent-notify"]
    );
    const parsed = JSON.parse(updated);

    expect(parsed.theme).toBe("dark");
    expect(parsed.nested).toEqual({ enabled: true });
    expect(parsed.hooks.PreToolUse).toEqual([
      { hooks: [{ type: "command", command: "existing" }] }
    ]);
  });

  it("treats whitespace-only input as empty settings", () => {
    const updated = patchClaudeSettings("  \n\t  ", ["agent-notify"]);
    const parsed = JSON.parse(updated);

    expect(parsed.hooks.Notification[0].matcher).toBe(
      "permission_prompt|idle_prompt|elicitation_dialog"
    );
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe(
      "agent-notify handle claude --event Stop"
    );
  });

  it("fails explicitly for malformed existing hooks structures", () => {
    expect(() =>
      patchClaudeSettings(JSON.stringify({ hooks: [] }), ["agent-notify"])
    ).toThrow(/hooks/i);
  });

  it("fails explicitly when the root settings value is not an object", () => {
    expect(() => patchClaudeSettings(JSON.stringify([]), ["agent-notify"])).toThrow(/object/i);
  });
});
