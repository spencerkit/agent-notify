# Agent Notify Sound Themes Design

## Goal

Add built-in sound themes that users can select without managing their own audio files.

Primary outcomes:

- `agent-notify` ships with built-in `.wav` files
- users can browse and apply named sound themes from the CLI
- stage toggles remain independent from sound themes

## Scope

This work covers:

- built-in sound theme metadata
- packaged `.wav` assets
- a `sound_theme` config key
- `theme list`, `theme show`, and `theme apply` commands
- runtime resolution of built-in themed sounds

This work does not cover:

- user-defined custom themes
- changing which stages are enabled when a theme is applied
- replacing stage-specific manual overrides

## Theme Model

Built-in themes:

- `subtle`
- `standard`
- `urgent`

Each theme contains one sound per normalized stage:

- `needs_input`
- `completed`
- `failed`

Themes only define sounds. They do not change:

- `notify_needs_input`
- `notify_completed`
- `notify_failed`

## Configuration Model

Add:

- `sound_theme?: string`

New TOML key:

- `sound_theme`

If `sound_theme` is set to a built-in theme name, `agent-notify` resolves the matching built-in `.wav` file for the current stage.

## Sound Resolution Order

For a stage sound:

1. manual stage override: `sound_file_<stage>`
2. built-in `sound_theme` stage sound
3. generic `sound_file`
4. existing platform fallback commands
5. terminal bell fallback

This keeps explicit user overrides above theme defaults.

## CLI Contract

Add:

- `agent-notify theme list`
- `agent-notify theme show <subtle|standard|urgent>`
- `agent-notify theme apply <subtle|standard|urgent>`

Behavior:

- `theme list` prints all built-in names with short descriptions
- `theme show <name>` prints theme details and stage coverage
- `theme apply <name>` writes `sound_theme = "<name>"` into the global config
- applying a theme does not clear explicit `sound_file_*` overrides

## Asset Packaging

The package should ship built-in `.wav` files under a packaged asset directory so the runtime can resolve them locally after `npm install -g`.

Requirements:

- assets must be included in `npm pack`
- runtime resolution must work from the bundled `dist/cli.js`
- `WSL` and Windows custom playback must continue to work with built-in asset paths

## Success Criteria

The work is successful when:

- a user can run `agent-notify theme apply standard`
- `config get` shows `sound_theme = "standard"`
- a themed stage uses the built-in asset when no manual stage override exists
- stage toggles continue to control whether notifications are emitted
