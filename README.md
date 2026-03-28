# agent-notify

`agent-notify` is a native TypeScript CLI for sending local completion and attention notifications from Codex and Claude Code.

Published package:

- `@spencer-kit/agent-notify`
- installed executable: `agent-notify`

## What It Does

- patches Codex and Claude Code config files to call `agent-notify` when work finishes or needs input
- normalizes Codex and Claude hook payloads into a shared event model
- sends local desktop notifications and sound fallbacks
- dedupes repeated events and keeps a local event log

## Install

Global install:

```bash
npm install -g @spencer-kit/agent-notify
```

One-off execution:

```bash
npx @spencer-kit/agent-notify install codex --dry-run
```

After install, the command name is still:

```bash
agent-notify
```

## Quick Start

Install the Codex hook:

```bash
agent-notify install codex
```

Install the Claude Code hooks:

```bash
agent-notify install claude
```

Preview the generated config before writing anything:

```bash
agent-notify install codex --dry-run
agent-notify install claude --dry-run
```

## Commands

Install the Codex hook into `~/.codex/config.toml`:

```bash
agent-notify install codex
```

Install the Claude Code hooks into `~/.claude/settings.json`:

```bash
agent-notify install claude
```

Preview either install without writing files:

```bash
agent-notify install codex --dry-run
agent-notify install claude --dry-run
```

Handle a Codex notify payload directly:

```bash
agent-notify handle codex '{"type":"agent-turn-complete","thread-id":"thread-1","turn-id":"turn-1","cwd":"/tmp/demo","input-messages":["rename foo"],"last-assistant-message":"rename complete"}'
```

Handle a Claude Code hook payload from stdin:

```bash
printf '%s\n' '{"session_id":"session-1","cwd":"/tmp/demo","notification_type":"idle_prompt","message":"Claude is waiting"}' | agent-notify handle claude --event Notification
```

Supported Claude events:

- `Notification`
- `Stop`
- `StopFailure`

CLI forms:

```bash
agent-notify install codex [--config <path>] [--dry-run]
agent-notify install claude [--settings <path>] [--dry-run]
agent-notify handle codex '<json>' [--state-dir <path>]
agent-notify handle claude --event <Notification|Stop|StopFailure> ['<json>'] [--state-dir <path>]
```

If the JSON payload is omitted for `handle`, the CLI reads it from stdin.

## Paths

- Codex config: `~/.codex/config.toml`
- Claude settings: `~/.claude/settings.json`
- global config: `~/.config/agent-notify/config.toml`
- repo override: `.agent-notify.toml`
- state dir: `~/.local/state/agent-notify`

## Notification Behavior

- `Notification` maps to `needs_input`
- `Stop` maps to `completed`
- `StopFailure` maps to `failed`
- desktop delivery falls back across supported local mechanisms
- repeated events are suppressed for a short dedupe window
- provider failures are fail-open and should not block agent execution

## Development

```bash
npm install
npm test
npm run build
npm pack
```

## Release

This repository is set up for GitHub Actions based publishing to npm when a GitHub Release is published from a version tag.

### One-Time Setup

1. Create the GitHub repository at `spencerkit/agent-notify`, or update `package.json` if your actual repo slug differs.
2. On npm, configure `@spencer-kit/agent-notify` to use a GitHub Actions Trusted Publisher.
3. In the npm Trusted Publisher configuration, use this repository and this exact workflow filename:

```text
.github/workflows/release.yml
```

The workflow filename must match exactly or npm trusted publishing will reject the release job.

### Release Steps

1. Update `package.json` to the target version.
2. Run the local verification steps:

```bash
npm test
npm run build
npm pack --dry-run
```

3. Commit the release changes.
4. Create and push the version tag:

```bash
git tag v0.1.0
git push origin main --tags
```

5. In GitHub, create a GitHub Release from that tag and publish it.
6. GitHub Actions runs [`release.yml`](./.github/workflows/release.yml), verifies the tag matches `package.json`, reruns CI, and publishes the package to npm.

### GitHub Actions

- [`ci.yml`](./.github/workflows/ci.yml) runs on pushes to `main` and on pull requests.
- [`release.yml`](./.github/workflows/release.yml) runs only when a GitHub Release is published.
- The release workflow uses npm Trusted Publisher authentication and publishes the public scoped package with provenance.
