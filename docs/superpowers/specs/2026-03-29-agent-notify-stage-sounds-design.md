# Agent Notify Stage Sounds And Version Design

## Goal

Extend `agent-notify` with:

- a top-level `agent-notify version` command
- per-stage sound overrides for the existing normalized states
- explicit documentation for how normalized stages map to Codex and Claude hooks

Primary user-facing outcome:

- users can keep one global fallback sound and optionally override the sound for `needs_input`, `completed`, and `failed`

## Scope

This work covers:

- a `version` CLI command
- stage-specific sound config keys and matching CLI config commands
- sound resolution rules for stage-specific playback
- README updates for stage mapping and configuration examples

This work does not cover:

- new remote notification channels
- Codex hook-based expansion beyond the current `notify` integration
- per-tool sound files separate from normalized stages

## Stage Model

The public stage model remains normalized and stable:

- `needs_input`
- `completed`
- `failed`

`agent-notify` should not expose raw hook names as its primary public model because the package is meant to abstract tool-specific event shapes behind one CLI and one config format.

## Hook Mapping

### Codex

- `completed`
  - mapped from Codex `notify` payloads with `type = "agent-turn-complete"`
- `needs_input`
  - no stable official `notify` event currently mapped
- `failed`
  - no stable official `notify` event currently mapped

Reasoning:

- the current package installs Codex through `notify`
- Codex `notify` is the stable integration already in use here
- expanding to lower-level Codex hooks in this change would expand scope and risk platform regressions without a clear user requirement

### Claude Code

- `needs_input`
  - mapped from `Notification`
  - limited to `permission_prompt`, `idle_prompt`, and `elicitation_dialog`
- `completed`
  - mapped from `Stop`
- `failed`
  - mapped from `StopFailure`

`SubagentStop` is intentionally not a first-class normalized state in this package. It can be added later if there is a concrete user need, but it should not change the public stage model now.

## CLI Contract

Existing command forms remain valid:

- `agent-notify install codex`
- `agent-notify install claude`
- `agent-notify handle codex ...`
- `agent-notify handle claude ...`
- `agent-notify config get`
- `agent-notify config set sound-file <path>`
- `agent-notify config unset sound-file`

Add:

- `agent-notify version`
- `agent-notify config set sound-file-needs-input <path>`
- `agent-notify config set sound-file-completed <path>`
- `agent-notify config set sound-file-failed <path>`
- `agent-notify config unset sound-file-needs-input`
- `agent-notify config unset sound-file-completed`
- `agent-notify config unset sound-file-failed`

Behavior:

- `version` prints the installed package version and exits successfully
- stage-specific `set` and `unset` commands operate on the same global config file as existing config commands
- existing `sound-file` remains the global fallback sound for all stages

## Configuration Model

Extend `AppConfig` with:

- `soundFileNeedsInput?: string`
- `soundFileCompleted?: string`
- `soundFileFailed?: string`

New TOML keys:

- `sound_file_needs_input`
- `sound_file_completed`
- `sound_file_failed`

Resolution order for a sound played for a normalized state:

1. stage-specific sound file
2. generic `sound_file`
3. existing built-in platform fallback commands
4. terminal bell fallback

## Implementation Shape

- `src/config.ts`
  - parse and format the new TOML keys
  - expose a helper that resolves the effective sound file for a normalized state
- `src/cli.ts`
  - add `version`
  - extend `config set` and `config unset` to support the new keys
- `src/notifier.ts`
  - pass stage-aware sound configuration into the default sound provider
- `src/providers.ts`
  - choose the effective sound file per event state before running platform-specific playback
- tests
  - add explicit coverage for `version`
  - add coverage for config parsing and CLI mutation of stage-specific keys
  - add coverage for stage-specific sound selection and generic fallback

## Error Handling

- invalid `config set` and `config unset` invocations still return usage errors
- unknown or unsupported hook payloads continue to be rejected at parse time
- missing stage-specific sound files continue to fall back to the generic sound or built-in fallback path
- `version` should fail only if package metadata cannot be read, and the error should stay explicit

## Testing Strategy

Required verification:

- `version` command output
- TOML parsing and formatting for the new keys
- CLI mutation behavior for stage-specific config commands
- sound selection precedence:
  - stage-specific override wins
  - generic fallback used when stage-specific is unset
- existing install and handle flows remain green

Final verification:

- `npm test`
- `npm run build`
- `npm pack --dry-run`
