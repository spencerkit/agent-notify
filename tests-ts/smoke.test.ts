import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) =>
      rm(path, {
        force: true,
        recursive: true
      })
    )
  );

  await rm(new URL("../dist", import.meta.url), {
    force: true,
    recursive: true
  });
});

describe("package smoke", () => {
  it("exports a CLI entrypoint", async () => {
    const mod = await import("../src/cli.js");
    expect(typeof mod.main).toBe("function");
  });

  it("installs and runs the packaged CLI bin", async () => {
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const packDir = await mkdtemp(join(tmpdir(), "agent-notify-pack-"));
    const installDir = await mkdtemp(join(tmpdir(), "agent-notify-install-"));

    cleanupPaths.push(packDir, installDir);

    const { stdout: tarballName } = await execFileAsync(
      "npm",
      ["pack", "--pack-destination", packDir],
      { cwd: repoRoot }
    );
    const tarballFile = tarballName
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.endsWith(".tgz"))
      .at(-1);

    expect(tarballFile).toBeDefined();

    const tarballPath = join(packDir, tarballFile!);

    await writeFile(
      join(installDir, "package.json"),
      JSON.stringify(
        {
          name: "agent-notify-smoke-install",
          private: true
        },
        null,
        2
      )
    );

    await execFileAsync("npm", ["install", tarballPath], {
      cwd: installDir
    });

    const binPath = join(
      installDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "agent-notify.cmd" : "agent-notify"
    );
    const command =
      process.platform === "win32"
        ? { file: binPath, args: [] as string[] }
        : { file: binPath, args: [] as string[] };

    const result = await execFileAsync(command.file, command.args, {
      cwd: installDir,
      env: {
        ...process.env,
        AGENT_NOTIFY_SMOKE_SIGNAL: "1"
      }
    });

    expect(result.stdout).toBe("agent-notify:main-ran\n");
    expect(result.stderr).toBe("");

    const { stdout, stderr } = await execFileAsync("npm", ["pack", "--dry-run"], {
      cwd: repoRoot
    });
    expect(`${stdout}${stderr}`).toContain("dist/cli.js");
  });
});
