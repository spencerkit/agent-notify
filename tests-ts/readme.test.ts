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
});
