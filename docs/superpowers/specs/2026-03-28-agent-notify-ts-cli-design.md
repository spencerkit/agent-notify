# Agent Notify TypeScript CLI Design

## Goal

Replace the current Python implementation with a native npm-publishable TypeScript CLI while preserving the existing command surface:

- `agent-notify install codex`
- `agent-notify install claude`
- `agent-notify handle codex <json>`
- `agent-notify handle claude --event <Event>`

The result should be installable via `npm i -g agent-notify` and runnable via `npx agent-notify`.

## Why Replace Instead Of Wrapping

The TypeScript CLI will be the only runtime implementation. We will not keep Python as an execution dependency or wrap it behind an npm shim.

Reasons:

- npm users should not need Python installed
- global install and `npx` behavior should be native
- release, support, and testing should target one runtime
- the codebase is small enough that a direct rewrite is cheaper than dual-stack maintenance

## Scope

This migration covers:

- rewrite all runtime code in TypeScript
- replace Python tests with Node-side tests
- replace Python packaging with npm packaging
- preserve external behavior where practical
- update docs to npm-first usage

This migration does not include:

- Slack, Telegram, email, or webhook providers
- Windows support guarantees
- daemon/background service mode
- Codex experimental Stop hook installation

## Architecture

The new CLI will be a small Node package with focused modules:

- `src/cli.ts`
  - argument parsing and command dispatch
- `src/events.ts`
  - source-specific payload normalization
- `src/store.ts`
  - dedupe and JSONL persistence
- `src/providers.ts`
  - desktop notification and sound delivery
- `src/installers.ts`
  - patching Codex and Claude config files
- `src/config.ts`
  - config loading and precedence rules

Build and test stack:

- TypeScript
- `tsup` for build output
- `vitest` for tests
- Node built-ins preferred over extra dependencies

Published entrypoint:

- `package.json` `bin.agent-notify -> dist/cli.js`

## Behavior Compatibility

The migration preserves the current CLI contract and event semantics.

Normalized states:

- `completed`
- `needs_input`
- `failed`

Event mappings:

- Codex legacy `notify` payload -> `completed`
- Claude `Notification` with `permission_prompt|idle_prompt|elicitation_dialog` -> `needs_input`
- Claude `Stop` -> `completed`
- Claude `StopFailure` -> `failed`

Paths remain stable:

- global config: `~/.config/agent-notify/config.toml`
- repo override: `.agent-notify.toml`
- state log: `~/.local/state/agent-notify/events.jsonl`

## Installation Behavior

`agent-notify install codex`

- updates `~/.codex/config.toml`
- writes a top-level `notify = [...]` command array
- must not accidentally place `notify` inside TOML tables such as `[tui]`

`agent-notify install claude`

- updates `~/.claude/settings.json`
- configures:
  - `Notification` matcher for `permission_prompt|idle_prompt|elicitation_dialog`
  - `Stop`
  - `StopFailure`

Both install commands support `--dry-run`.

## Notification Delivery

Delivery remains fail-open.

- invalid CLI input returns non-zero
- provider failures do not block normal agent flow
- unsupported desktop notification environments fall back to sound and/or log-only behavior
- malformed target config files during install return explicit errors instead of best-effort repair

Platform target:

- supported: macOS, Linux
- not promised: Windows

Provider priority:

- desktop:
  - macOS: `osascript`
  - Linux: `notify-send`
- sound:
  - system command when available
  - otherwise BEL fallback

Remote or `tmux` delivery depends on the surrounding terminal environment; the CLI only guarantees local execution behavior.

## Persistence And Noise Control

Each event is normalized and keyed by:

- tool
- session id
- state
- summary hash

Deduped events are suppressed for a short TTL. Emitted events are written to `events.jsonl`, and retention pruning keeps the log bounded by age and count.

## Migration Strategy

This is an in-place replacement, not a staged dual-runtime migration.

Repository changes:

- remove Python packaging files
- remove Python runtime modules
- remove Python tests
- add npm package metadata, TypeScript config, and Node tests
- rewrite README to npm installation and release flow

The old Python implementation is not retained as a reference implementation in the runtime tree.

## Testing Strategy

The TypeScript rewrite must ship with:

- unit tests
  - payload normalization
  - dedupe behavior
  - provider selection
  - installer patch logic
- CLI tests
  - `handle codex`
  - `handle claude --event ...`
  - `install codex --dry-run`
  - `install claude --dry-run`
- regression coverage
  - Codex top-level `notify` placement before TOML tables
- release checks
  - `npm test`
  - `npm run build`
  - `npm pack`

## Release Outcome

The finished package should support:

- local development with `npm install`
- build with `npm run build`
- global install with `npm i -g agent-notify`
- ad hoc execution with `npx agent-notify`
