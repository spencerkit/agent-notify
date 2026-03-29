# Agent Notify Stage Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-stage notification enablement for `needs_input`, `completed`, and `failed`, without changing the existing normalized stage model or stage-specific sound configuration.

**Architecture:** Extend the flat TOML config with three stage-level booleans, expose matching `config set` / `config unset` commands, and make the notifier treat stage enablement as a gate above desktop and sound delivery while still recording non-deduped events.

**Tech Stack:** TypeScript, Node.js 24, vitest, tsup, npm

---

## File Map

- `src/config.ts`
  - add stage toggle config fields, TOML keys, and helper predicates
- `src/cli.ts`
  - support config set/unset for stage toggles
- `src/notifier.ts`
  - apply stage gating before desktop and sound delivery
- `tests-ts/config.test.ts`
  - cover parse / format / predicate behavior
- `tests-ts/cli.test.ts`
  - cover set / unset stage toggles
- `tests-ts/notifier.test.ts`
  - cover disabled-stage behavior
- `tests-ts/readme.test.ts`
  - cover docs
- `README.md`
  - document stage toggles and examples

### Task 1: Write Failing Tests

**Files:**
- Modify: `tests-ts/config.test.ts`
- Modify: `tests-ts/cli.test.ts`
- Modify: `tests-ts/notifier.test.ts`
- Modify: `tests-ts/readme.test.ts`

- [ ] **Step 1: Add tests for stage toggle parsing and formatting**
- [ ] **Step 2: Add tests for CLI set/unset of notify-* keys**
- [ ] **Step 3: Add notifier tests proving disabled stages are recorded but do not emit delivery**
- [ ] **Step 4: Run focused tests and confirm they fail**

Run: `npm test -- tests-ts/config.test.ts tests-ts/cli.test.ts tests-ts/notifier.test.ts tests-ts/readme.test.ts`

### Task 2: Implement Stage Toggle Support

**Files:**
- Modify: `src/config.ts`
- Modify: `src/cli.ts`
- Modify: `src/notifier.ts`

- [ ] **Step 1: Add config keys and helpers**
- [ ] **Step 2: Extend CLI key routing**
- [ ] **Step 3: Apply stage gating in notifier**
- [ ] **Step 4: Re-run focused tests and confirm they pass**

### Task 3: Update Docs And Verify

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document stage toggles and examples**
- [ ] **Step 2: Run full verification**

Run: `npm test`
Run: `npm run build`
Run: `npm pack --dry-run`
