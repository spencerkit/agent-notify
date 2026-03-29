import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSoundTheme,
  listSoundThemes,
  resolveThemeSoundFile
} from "../src/sound-themes.js";

describe("sound themes", () => {
  it("lists built-in sound themes", () => {
    expect(listSoundThemes().map((theme) => theme.name)).toEqual([
      "subtle",
      "standard",
      "urgent"
    ]);
  });

  it("returns theme metadata by name", () => {
    expect(getSoundTheme("standard")).toMatchObject({
      name: "standard"
    });
    expect(getSoundTheme("missing")).toBeUndefined();
  });

  it("resolves packaged theme sound files for each stage", () => {
    const failedPath = resolveThemeSoundFile("standard", "failed");

    expect(failedPath).toBeDefined();
    expect(failedPath).toMatch(/standard.*failed\.wav$/);
    expect(existsSync(failedPath as string)).toBe(true);
  });
});
