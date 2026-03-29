# Agent Notify Stage Toggle Design

## Goal

Extend `agent-notify` so users can control which normalized stages produce notifications, while keeping stage-specific sound customization.

Primary outcomes:

- users can enable or disable notifications for `needs_input`, `completed`, and `failed`
- users can continue to assign different sound files to those same stages
- event recording and dedupe behavior remain intact

## Scope

This work covers:

- per-stage notification toggles
- CLI commands for setting and unsetting those toggles
- notifier behavior changes so a disabled stage skips desktop and sound delivery
- README updates describing stage toggles and stage sounds together

This work does not cover:

- separate per-stage desktop and sound toggles
- changes to Codex / Claude hook mappings
- any new delivery channels

## Configuration Model

Add three new boolean config keys:

- `notify_needs_input`
- `notify_completed`
- `notify_failed`

Default values:

- `notify_needs_input = true`
- `notify_completed = true`
- `notify_failed = true`

These are stage-level gates. If a stage is disabled, `agent-notify` records the event but does not send a desktop notification or sound.

Existing config remains:

- global desktop toggle: `desktop_enabled`
- global sound toggle: `sound_enabled`
- compatibility toggle for completed sounds: `sound_on_completed`
- stage-specific sound files:
  - `sound_file_needs_input`
  - `sound_file_completed`
  - `sound_file_failed`

## Decision Order

For each normalized event:

1. dedupe check
2. stage enabled check
3. desktop delivery check
4. sound delivery check
5. event record

Sound delivery still follows:

1. stage enabled check must pass
2. global `sound_enabled` must pass
3. `completed` also requires `sound_on_completed = true`
4. sound file selection order:
   - stage-specific file
   - generic `sound_file`
   - built-in platform fallback
   - terminal bell fallback

## CLI Contract

Add support for:

- `agent-notify config set notify-needs-input true|false`
- `agent-notify config set notify-completed true|false`
- `agent-notify config set notify-failed true|false`
- `agent-notify config unset notify-needs-input`
- `agent-notify config unset notify-completed`
- `agent-notify config unset notify-failed`

Behavior:

- `set` validates a boolean-like value and writes a flat TOML boolean
- `unset` removes only the targeted key
- `config get` prints these keys as part of the stable default config output

## Implementation Shape

- `src/config.ts`
  - add stage toggle fields
  - parse / format the new TOML keys
  - add a helper to decide whether a stage is enabled
- `src/cli.ts`
  - extend `config set` and `config unset` to cover stage toggle keys
- `src/notifier.ts`
  - skip desktop and sound delivery when the stage is disabled
  - still record the event after a non-deduped disabled stage
- tests
  - cover parsing, formatting, CLI mutation, and notifier behavior

## Success Criteria

The work is successful when:

- users can disable `completed` while keeping `failed` on
- stage-specific sounds still work when the corresponding stage is enabled
- a disabled stage is recorded but produces no notification or sound
- existing sound and installer behavior stays green
