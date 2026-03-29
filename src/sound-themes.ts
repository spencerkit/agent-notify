import { fileURLToPath } from "node:url";
import type { NormalizedState } from "./events.js";

export type SoundThemeName = "subtle" | "standard" | "urgent";

export interface SoundTheme {
  name: SoundThemeName;
  description: string;
  files: Record<NormalizedState, string>;
}

const SOUND_THEMES: readonly SoundTheme[] = [
  {
    name: "subtle",
    description: "Soft, low-interruption cues",
    files: {
      needs_input: "subtle-needs_input.wav",
      completed: "subtle-completed.wav",
      failed: "subtle-failed.wav"
    }
  },
  {
    name: "standard",
    description: "Balanced everyday cues",
    files: {
      needs_input: "standard-needs_input.wav",
      completed: "standard-completed.wav",
      failed: "standard-failed.wav"
    }
  },
  {
    name: "urgent",
    description: "High-contrast attention cues",
    files: {
      needs_input: "urgent-needs_input.wav",
      completed: "urgent-completed.wav",
      failed: "urgent-failed.wav"
    }
  }
] as const;

export function listSoundThemes(): readonly SoundTheme[] {
  return SOUND_THEMES;
}

export function getSoundTheme(name: string): SoundTheme | undefined {
  return SOUND_THEMES.find((theme) => theme.name === name);
}

export function resolveThemeSoundFile(
  themeName: string | undefined,
  state: NormalizedState
): string | undefined {
  if (!themeName) {
    return undefined;
  }

  const theme = getSoundTheme(themeName);
  if (!theme) {
    return undefined;
  }

  return fileURLToPath(new URL(`../assets/themes/${theme.files[state]}`, import.meta.url));
}
