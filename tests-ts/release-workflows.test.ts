import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release workflows", () => {
  it("defines package metadata required for scoped npm publishing", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as {
      name: string;
      publishConfig?: {
        access?: string;
      };
      repository?: {
        type?: string;
        url?: string;
      };
    };

    expect(packageJson.name).toBe("@spencer-kit/agent-notify");
    expect(packageJson.publishConfig?.access).toBe("public");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "git+https://github.com/spencerkit/agent-notify.git"
    });
  });

  it("ships a CI workflow that validates the package on pushes and pull requests", () => {
    const ciPath = new URL("../.github/workflows/ci.yml", import.meta.url);
    expect(existsSync(ciPath)).toBe(true);

    const workflow = readFileSync(ciPath, "utf8");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm pack --dry-run");
  });

  it("ships a release workflow that publishes when a GitHub Release is published", () => {
    const releasePath = new URL("../.github/workflows/release.yml", import.meta.url);
    expect(existsSync(releasePath)).toBe(true);

    const workflow = readFileSync(releasePath, "utf8");

    expect(workflow).toContain("release:");
    expect(workflow).toContain("types: [published]");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("ref: ${{ github.event.release.tag_name }}");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm publish --provenance --access public");
  });

  it("documents the GitHub Release publishing flow", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("## Release");
    expect(readme).toContain("GitHub Release");
    expect(readme).toContain("```text\nrelease.yml\n```");
    expect(readme).toContain("manual bootstrap publish");
    expect(readme).toContain("npm publish --access public");
    expect(readme).toContain("git tag v");
    expect(readme).toContain("git push origin main --tags");
    expect(readme).toContain("release.yml");
    expect(readme).toContain("Trusted Publisher");
  });
});
