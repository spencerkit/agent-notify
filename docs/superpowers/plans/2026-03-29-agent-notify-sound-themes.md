# Agent Notify Sound Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship built-in sound themes with local `.wav` assets, let users browse and apply them from the CLI, and resolve themed sounds between manual stage overrides and existing fallback sounds.

**Architecture:** Add a dedicated sound theme module with metadata and asset resolution, store the selected theme in `sound_theme`, and keep notifier behavior unchanged except for the provider choosing theme assets when no explicit stage override exists. Package the `.wav` files alongside the built CLI.

**Tech Stack:** TypeScript, Node.js 24, vitest, tsup, npm

---

## File Map

- `src/config.ts`
  - add `soundTheme`
  - parse and format `sound_theme`
- `src/sound-themes.ts`
  - define built-in themes and asset resolution helpers
- `src/providers.ts`
  - resolve sound file order with theme fallback
- `src/notifier.ts`
  - pass selected `soundTheme` into the sound provider
- `src/cli.ts`
  - add `theme list/show/apply`
- `tests-ts/sound-themes.test.ts`
  - cover metadata and asset path resolution
- `tests-ts/cli.test.ts`
  - cover theme commands
- `tests-ts/notifier.test.ts`
  - cover theme-based sound selection
- `tests-ts/readme.test.ts`
  - cover docs
- `assets/themes/*.wav`
  - built-in sound files
- `package.json`
  - include assets in packed files

### Task 1: Add Failing Tests

**Files:**
- Modify: `tests-ts/cli.test.ts`
- Modify: `tests-ts/config.test.ts`
- Modify: `tests-ts/notifier.test.ts`
- Modify: `tests-ts/readme.test.ts`
- Create: `tests-ts/sound-themes.test.ts`

- [ ] **Step 1: Add CLI tests for theme list/show/apply**
- [ ] **Step 2: Add config test for `sound_theme`**
- [ ] **Step 3: Add provider test for themed sound fallback**
- [ ] **Step 4: Add theme metadata/asset tests**
- [ ] **Step 5: Run focused tests and confirm failure**

### Task 2: Implement Theme Support

**Files:**
- Modify: `src/config.ts`
- Create: `src/sound-themes.ts`
- Modify: `src/providers.ts`
- Modify: `src/notifier.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Add config/model support**
- [ ] **Step 2: Add sound theme metadata and resolution**
- [ ] **Step 3: Add CLI theme commands**
- [ ] **Step 4: Re-run focused tests and confirm pass**

### Task 3: Add Assets And Verify Packaging

**Files:**
- Create: `assets/themes/*.wav`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add built-in theme assets**
- [ ] **Step 2: Include assets in package files**
- [ ] **Step 3: Update docs**
- [ ] **Step 4: Run full verification**

Run: `npm test`
Run: `npm run build`
Run: `npm pack --dry-run`
