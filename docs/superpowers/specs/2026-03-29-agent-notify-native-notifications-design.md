# Agent Notify Native Notifications Design

## Goal

Upgrade `agent-notify` so notifications feel native on each target environment and users can configure a custom notification sound from the CLI.

Primary user-facing outcomes:

- `WSL` uses Windows native notification delivery instead of blocking popup dialogs
- `Windows` uses Windows native notification delivery
- `macOS` continues to use macOS native notification delivery
- users can configure a custom sound file path through `agent-notify config ...`

## Scope

This work covers:

- native desktop notification routing for `WSL`, `Windows`, `macOS`, and Linux
- a configurable `sound_file` setting in the global config
- CLI commands for reading and updating the global config
- sound playback fallback rules that avoid blocking dialogs

This work does not cover:

- webhook, Slack, email, or mobile push channels
- per-state sound files
- tray apps, background daemons, or resident services
- GUI config editing

## User Experience

### Notification Style

- `WSL`
  - use Windows notification-style delivery
  - do not use blocking `Popup` / confirm-style dialogs as the primary notification path
- `Windows`
  - use Windows notification-style delivery
- `macOS`
  - use `osascript` desktop notifications
- Linux
  - use `notify-send`

If desktop delivery fails, the CLI falls back to sound only. It must not block the agent flow with interactive dialogs.

### Custom Sound

Users can set a global custom sound path:

```toml
sound_file = "/absolute/path/to/sound.wav"
```

The initial implementation guarantees Windows and `WSL` playback for `.wav` files because it uses native Windows sound playback APIs. On `macOS` and Linux, supported formats depend on the available native player command.

If `sound_file` is not set, the existing system-default fallback behavior remains in place.

## CLI Contract

Add a new top-level command group:

- `agent-notify config get`
- `agent-notify config set sound-file <path>`
- `agent-notify config unset sound-file`

Behavior:

- these commands operate on the global config file only: `~/.config/agent-notify/config.toml`
- `config get` prints the effective global config file contents if it exists, otherwise prints defaults in a stable flat TOML form
- `config set sound-file <path>` creates the config directory when needed and upserts `sound_file = "..."`
- `config unset sound-file` removes only the `sound_file` key and preserves unrelated keys

The existing command surface remains unchanged:

- `agent-notify install codex`
- `agent-notify install claude`
- `agent-notify handle codex <json>`
- `agent-notify handle claude --event <Event>`

## Configuration Model

Extend `AppConfig` with:

- `soundFile?: string`

Config precedence remains unchanged:

- environment variables
- repo override `.agent-notify.toml`
- global config `~/.config/agent-notify/config.toml`
- built-in defaults

New TOML key:

- `sound_file`

No new environment variable is required for the first implementation.

## Delivery Architecture

### Desktop Provider

Desktop provider routing becomes:

- macOS: `osascript`
- Linux: `notify-send`
- `WSL`: Windows-side native toast notification via `powershell.exe`
- `Windows`: native Windows toast notification via PowerShell

Windows-family delivery should use a non-blocking notification mechanism built on the Windows toast APIs, not `Popup` / confirm dialogs. If the chosen Windows notification API fails in `WSL` or `Windows`, the provider returns `false` and lets the notifier continue to sound fallback.

### Sound Provider

Sound provider routing becomes:

- if `sound_file` is configured:
  - `WSL` / `Windows`: use PowerShell with `.NET` `System.Media.SoundPlayer` for the configured file
  - `macOS`: use `afplay <sound_file>` when available
  - Linux: use an available player command for the configured file
- if custom playback fails or `sound_file` is unset:
  - use the existing system fallback commands
  - in `WSL`, prefer a Windows-side beep fallback before terminal BEL
  - finally fall back to terminal BEL / stdout BEL

## File Responsibilities

- `src/config.ts`
  - parse and expose `sound_file`
  - keep precedence rules intact
- `src/cli.ts`
  - add `config get|set|unset`
- `src/providers.ts`
  - add Windows / `WSL` desktop notification path
  - add custom sound playback path
- `tests-ts/notifier.test.ts`
  - cover provider selection and fallback behavior
- `tests-ts/config.test.ts`
  - cover `sound_file` parsing and precedence
- `tests-ts/cli.test.ts`
  - cover config command routing and file updates
- `README.md`
  - document notification routing and sound configuration

## Error Handling

- invalid `config` command usage returns non-zero with a usage error
- config file writes create parent directories as needed
- malformed existing config files remain fail-open where practical, but syntax that cannot be safely preserved should return an explicit error
- desktop notification failures must not stop event recording
- custom sound playback failures fall back to the next sound mechanism

## Testing Strategy

Required coverage:

- config parsing for `sound_file`
- CLI config read / set / unset behavior
- Windows / `WSL` desktop provider selection
- custom sound playback command selection
- sound fallback when custom playback fails
- regression coverage for existing installer and notification behavior

Release verification remains:

- `npm test`
- `npm run build`
- `npm pack --dry-run`

## Success Criteria

The work is successful when:

- a `WSL` user receives non-blocking Windows-style notifications instead of confirm-style popups
- a user can set a custom sound with `agent-notify config set sound-file ...`
- existing install and handle flows continue to work unchanged
- notification failures remain fail-open and do not break agent tasks
