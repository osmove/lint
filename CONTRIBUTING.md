# Contributing

Thanks for contributing to `lint`.

This repo is a pnpm monorepo. Today it contains the CLI in `packages/cli/`. The OSS server (`lint-server`) and any future shared packages will land in additional `packages/*` directories.

## Development Setup

```sh
git clone https://github.com/osmove/lint.git
cd lint
corepack enable
pnpm install
pnpm verify
```

`pnpm verify` is the maintainer baseline. It runs `pnpm --filter lint verify`, which runs:

- type checking
- Biome on `src/`
- `pnpm audit`
- build via `tsup`
- npm packaging check with `npm pack --dry-run`
- repo-local quality gate via `lint ci`
- Vitest

## Repo layout

```
lint/
├── package.json               (private, "lint-monorepo")
├── pnpm-workspace.yaml
├── packages/
│   └── cli/
│       ├── package.json       (public, "lint")
│       ├── src/
│       ├── tests/
│       ├── README.md          (canonical, symlinked at root)
│       ├── CHANGELOG.md       (canonical, symlinked at root)
│       └── LICENSE            (canonical, symlinked at root)
├── AGENTS.md / CLAUDE.md      (canonical at root)
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── .github/
```

## Canonical CLI Surface

Prefer documenting and designing around the grouped command surface:

```sh
lint init
lint doctor
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

Run from the repo root:

```sh
pnpm verify
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

Useful commands from the repo root:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm pack:check
pnpm --filter lint quality-gate
```

Or directly from `packages/cli/`:

```sh
cd packages/cli
pnpm test
pnpm verify
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
2. Run `pnpm verify` from the repo root.
3. Confirm the package payload with `pnpm pack:check`.
4. Publish only from a green state.

To publish:

```sh
cd packages/cli
npm publish --tag next        # or --access public for first publish
```

`prepublishOnly` runs `npm run verify` automatically, so local publishes fail if the repo is not release-ready.
