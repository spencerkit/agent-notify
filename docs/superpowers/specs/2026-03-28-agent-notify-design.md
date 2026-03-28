# Agent Notify Design

## Goal

Build a small local CLI that turns Codex CLI and Claude Code lifecycle events into low-noise user notifications.

## Scope

This v1 targets personal use on macOS and Linux. It supports:

- Codex CLI `notify` as the stable completion path
- Claude Code `Notification`, `Stop`, and `StopFailure` hooks
- Desktop notification plus audible signal
- Local JSONL event logging with dedupe
- Global config with optional repo override
- Install commands that wire Codex and Claude to the notifier

This v1 does not ship chat integrations such as Slack or Telegram.

## Event Model

All incoming payloads normalize into one internal event shape:

- `tool`: `codex` or `claude`
- `state`: `completed`, `needs_input`, or `failed`
- `session_id`
- `cwd`
- `project`
- `summary`
- `raw_event`
- `occurred_at`

Mappings:

- Codex `notify` legacy payload -> `completed`
- Optional Codex `Stop` hook payload -> `completed`
- Claude `Notification` with `permission_prompt`, `idle_prompt`, or `elicitation_dialog` -> `needs_input`
- Claude `Stop` -> `completed`
- Claude `StopFailure` -> `failed`

## Delivery

Delivery is fail-open. Notification failures must never block agent execution.

Providers:

- Desktop provider
  - macOS: `osascript`
  - Linux: `notify-send`
- Sound provider
  - Prefer platform command when available
  - Fallback to BEL on the controlling TTY or stdout

Desktop and sound are separate providers so later webhook-style channels can be added without changing normalization or install logic.

## Noise Control

Each event is deduped for a short TTL using:

- `tool`
- `session_id`
- `state`
- normalized summary hash

The dedupe store lives beside the JSONL log under the user state directory.

## Configuration

Config precedence:

1. Environment variables
2. Repo override found by walking up from the event `cwd`: `.agent-notify.toml`
3. Global config: `~/.config/agent-notify/config.toml`
4. Built-in defaults

Defaults:

- desktop notifications enabled
- sound enabled for `needs_input` and `failed`
- sound enabled for `completed`, but separately configurable
- log retention: 7 days or 5000 entries
- dedupe window: 15 seconds
- payload text truncation: 180 characters

## Installation

`agent-notify install codex`

- writes or updates `~/.codex/config.toml`
- sets top-level `notify = [...]`
- uses the current Python interpreter path for portability

`agent-notify install claude`

- writes or updates `~/.claude/settings.json`
- installs `Notification`, `Stop`, and `StopFailure` command hooks

Both installers support `--dry-run`.

## Security

Only minimal event text is emitted by default:

- tool name
- project name
- cwd basename
- state
- short final summary

Prompt bodies, diffs, and transcripts are not sent externally in v1.

## Testing

The initial red-green loop covers:

- payload normalization for Codex and Claude
- dedupe and log retention behavior
- Codex TOML installer patching
- Claude JSON installer patching
- desktop provider command selection
