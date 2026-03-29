import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents npm installation and CLI usage", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("npm install -g @spencer-kit/agent-notify");
    expect(readme).toContain("npx @spencer-kit/agent-notify");
    expect(readme).toContain("installed executable: `agent-notify`");
    expect(readme).toContain("agent-notify install codex");
    expect(readme).toContain("agent-notify install claude");
  });

  it("documents config commands and custom sound setup", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("agent-notify version");
    expect(readme).toContain("agent-notify theme list");
    expect(readme).toContain("agent-notify theme show standard");
    expect(readme).toContain("agent-notify theme apply standard");
    expect(readme).toContain("agent-notify config get");
    expect(readme).toContain("agent-notify config set notify-needs-input");
    expect(readme).toContain("agent-notify config set notify-completed");
    expect(readme).toContain("agent-notify config set notify-failed");
    expect(readme).toContain("agent-notify config set sound-file");
    expect(readme).toContain("agent-notify config set sound-file-needs-input");
    expect(readme).toContain("agent-notify config set sound-file-completed");
    expect(readme).toContain("agent-notify config set sound-file-failed");
    expect(readme).toContain("agent-notify config unset sound-file");
    expect(readme).toContain("sound_file");
    expect(readme).toContain("notify_needs_input");
    expect(readme).toContain("notify_completed");
    expect(readme).toContain("notify_failed");
    expect(readme).toContain("sound_file_needs_input");
    expect(readme).toContain("sound_file_completed");
    expect(readme).toContain("sound_file_failed");
    expect(readme).toContain("sound_theme");
    expect(readme).toContain("~/.config/agent-notify/config.toml` by default");
    expect(readme).toContain("$XDG_CONFIG_HOME/agent-notify/config.toml");
    expect(readme).toContain("WSL -> Windows toast notifications");
    expect(readme).toContain("Windows -> Windows toast notifications");
    expect(readme).toContain("macOS -> `osascript`");
    expect(readme).toContain("Linux -> `notify-send`");
    expect(readme).toContain("Codex `agent-turn-complete` -> `completed`");
    expect(readme).toContain("Claude `Notification` -> `needs_input`");
    expect(readme).toContain("Claude `Stop` -> `completed`");
    expect(readme).toContain("Claude `StopFailure` -> `failed`");
  });
});
