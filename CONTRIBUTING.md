# Contributing

Thanks for contributing to `lint`.

This project moves fast, so the main goal of this guide is to keep the repo easy to maintain while the CLI surface, docs, and packaging rules keep evolving.

## Development Setup

```sh
git clone https://github.com/osmove/lint.git
cd lint
npm install
npm run verify
```

`npm run verify` is the maintainer baseline. It runs:

- type checking
- Biome on `src/`
- `npm audit`
- build via `tsup`
- npm packaging check with `npm pack --dry-run`
- repo-local quality gate via `lint ci`
- Vitest

## Canonical CLI Surface

Prefer documenting and designing around the grouped command surface:

```sh
lint setup init
lint setup doctor
lint hooks install
lint config recommend
lint install missing .
lint machine summary .
lint explain run .
lint auth login
lint format write ts
```

Legacy aliases still exist for backward compatibility, but new docs, examples, tests, and user-facing messages should prefer the canonical grouped commands.

## Before You Commit

Run:

```sh
npm run verify
```

If you changed the CLI, setup flows, or maintainer tooling, also check that these files still agree:

- `README.md`
- `CHANGELOG.md`
- `AGENTS.md`
- `CLAUDE.md`

## Code Guidelines

- Prefer argv-based command execution over shell-string execution.
- Keep cross-platform behavior in mind, especially for git hooks and local tooling.
- When changing the CLI, keep legacy aliases working unless you intentionally plan a breaking release.
- Keep the main help output focused on canonical commands; compatibility aliases should stay hidden when appropriate.
- Prefer machine-readable outputs to be stable and versioned when adding new automation-facing data.

## Tests

Useful commands:

```sh
npm test
npm run typecheck
npm run lint
npm run package:check
npm run quality-gate
```

Add or update tests when you change:

- CLI command structure
- JSON output shape
- project detection
- linter orchestration
- hook installation or inspection

## Release Hygiene

Before publishing:

1. Update `CHANGELOG.md` when the user-facing behavior changed.
2. Run `npm run verify`.
3. Confirm the package payload with `npm run package:check`.
4. Publish only from a green state.

`prepublishOnly` already runs `npm run verify`, so local publishes will fail if the repo is not release-ready.
