# Lint

**The universal linter.** One CLI to lint any language — with AI-powered code review.

[![npm version](https://img.shields.io/npm/v/lint.svg)](https://www.npmjs.com/package/lint)
[![license](https://img.shields.io/npm/l/lint.svg)](https://github.com/osmove/lint/blob/main/LICENSE)
[![CI](https://github.com/osmove/lint/actions/workflows/ci.yml/badge.svg)](https://github.com/osmove/lint/actions/workflows/ci.yml)

---

## What is Lint?

Lint wraps multiple language-specific linters into a single CLI. Instead of configuring ESLint, Rubocop, Ruff, Biome, and Stylelint separately, run one command:

```sh
lint
```

It auto-detects your languages, resolves linter conflicts, and lints everything — JavaScript, TypeScript, Python, Ruby, CSS, and more.

## Quick Start

```sh
npm i -g lint
cd /path/to/your/repo
lint init
lint
```

`lint init` scans your project, detects languages, suggests linters, installs missing ones, creates `.lintrc.yaml`, and sets up git hooks — all interactively.

## Features

- **Smart init** — Auto-detects languages, frameworks, and package managers
- **10 linters** — Biome, oxlint, ESLint, Prettier, Ruff, Pylint, RuboCop, Stylelint, Brakeman, erb-lint
- **Conflict resolution** — Biome auto-replaces ESLint+Prettier, Ruff replaces Pylint
- **Lint anything** — Staged files, directories, or specific files
- **AI-powered** — Code review, auto-fix, commit messages, error explanations (Claude)
- **JSON output** — `--format json` for CI/CD pipelines
- **Structured run metadata** — JSON output includes run mode, file count, selected linters, and policy metadata
- **Parallel execution** — Different-language linters run simultaneously
- **Managed hooks** — Portable hook install/uninstall/status with timeout, skip env, Husky/Lefthook compatibility
- **Zero config** — Works out of the box, customize with `.lintrc.yaml`
- **Doctor mode** — Inspect branch, dirty state, linters, config, and hook health
- **Project-aware defaults** — Defers to repo-local linter configs unless cloud policy rules override them

## Supported Linters

| Language | Linters | Speed |
|----------|---------|-------|
| JavaScript / TypeScript | Biome, oxlint, ESLint | Biome/oxlint: ~100x faster |
| Python | Ruff, Pylint | Ruff: ~100x faster |
| Ruby | RuboCop | — |
| CSS / SCSS | Stylelint | — |
| ERB Templates | erb-lint | — |
| Ruby on Rails | Brakeman (security) | — |
| Code Formatting | Prettier | — |

When Biome is installed, ESLint/Prettier/oxlint are automatically disabled (configurable in `.lintrc.yaml`).

By default, Lint now respects the target repository's own linter configuration. Temporary configs are only generated when cloud policy rules need to override local behavior.

## Commands

### Linting

```sh
lint                      # Lint staged files (default)
lint .                    # Lint entire project
lint src/                 # Lint specific directory
lint src/index.ts         # Lint specific file
lint --fix                # Auto-fix issues
lint --fix --dry-run      # Preview fixes without applying
lint --format json        # JSON output for CI/CD
lint ci                   # Repo-local quality gate (JSON + fail on warnings by default)
lint -q                   # Quiet mode (summary only)
lint -t                   # Show execution time
lint --exit-on-warnings   # Exit code 2 on warnings
```

### AI (powered by Claude)

```sh
lint ai setup             # Configure your Anthropic API key
lint ai review            # AI code review of staged changes
lint ai fix               # AI-powered auto-fix suggestions
lint ai commit            # Generate commit message from staged diff
lint ai explain           # Explain linting errors in plain language
```

### Setup & Diagnostics

```sh
lint init           # Smart setup wizard with auto-detection
lint bootstrap      # Non-interactive repo-local bootstrap
lint setup fix            # Apply recommended repo-local setup in one pass
lint config recommend     # Print a recommended .lintrc.yaml
lint doctor         # Diagnose setup, linters, hooks health
lint doctor --json  # Machine-readable health report
lint explain run .        # Explain file/linter/policy decisions without linting
lint machine summary .    # Compact machine-readable summary for automation
lint install missing .    # Install suggested linters that are not installed yet
lint ci --allow-warnings  # Quality gate but keep warnings non-blocking
lint hooks status         # Inspect managed hook status
lint hooks install        # Install git hooks
lint hooks uninstall      # Remove git hooks
lint format write ts      # Run Prettier on all `*.ts` files
```

### Account

```sh
lint auth signup
lint auth login
lint auth logout
lint auth status
```

Aliases like `lint auth whoami`, `lint signup`, `lint login`, `lint logout`, and `lint whoami` still work for backward compatibility, but `lint auth <action>` is now the canonical API and `lint auth status` is the preferred status command.

Internal hook entrypoints like `lint pre-commit`, `lint prepare-commit-msg`, and `lint post-commit` remain available for installed git hooks, but they are intentionally hidden from the main CLI help because they are not part of the primary user-facing surface.

## Configuration

### `.lintrc.yaml`

```yaml
linters:
  enabled: [biome, ruff, rubocop]
  disabled: [eslint, prettier, oxlint]

ignore:
  - node_modules/**
  - dist/**
  - "**/*.test.ts"

fix:
  enabled: true
  strategy: formatter-first  # or: parallel, sequential

hooks:
  timeout: 60               # seconds
  skip_env: LINT_SKIP   # LINT_SKIP=1 git commit ...
```

Without `.lintrc.yaml`, Lint uses smart defaults with automatic conflict resolution.

## Git Hooks

```sh
lint hooks install
lint hooks status
```

- Installs pre-commit, prepare-commit-msg, and post-commit hooks
- Auto-detects Husky/Lefthook and integrates instead of replacing
- Includes portable timeout protection and skip mechanism
- Uses explicit managed-hook markers for safer inspection and uninstall
- Skip: `LINT_SKIP=1 git commit ...` or `git commit --no-verify`

## Doctor

```sh
lint doctor
lint doctor --json
```

`lint doctor` gives a quick local health check for:

- git root, branch, and dirty/clean state
- `.lint/config` and `.lintrc.yaml`
- auth status
- project detection: languages, frameworks, package managers, hook managers
- installed, enabled, and effectively selected linters
- managed vs unmanaged git hooks

Legacy aliases like `lint setup:fix`, `lint config:recommend`, `lint install:missing`, `lint machine:summary`, `lint install:hooks`, `lint uninstall:hooks`, and `lint hooks:status` still work for backward compatibility, but the canonical API now prefers grouped commands like `lint setup fix`, `lint config recommend`, `lint install missing`, `lint machine summary`, and `lint hooks <action>`.

`lint init`, `lint bootstrap`, and `lint doctor` are top-level canonical commands (matching `npm init`, `git init`, etc.). The grouped forms `lint setup init`, `lint setup bootstrap`, and `lint setup doctor` are kept as hidden legacy aliases for backward compatibility.

`lint prettify <extension>` also still works as a compatibility alias, but the canonical formatting helper is now `lint format write <extension>`.

`lint explain-run` also still works as a compatibility alias, but the canonical explain helper is now `lint explain run`.

Use `lint doctor --json` when you want to consume the report from another tool, CI step, or control plane.

## Explain Run

```sh
lint explain run .
lint explain run src/
lint explain run --json .
```

`lint explain run` shows:

- which linters were selected or skipped, and why
- which conflicts were auto-resolved
- which fix strategy would be used
- which files were ignored
- which files are covered or uncovered
- whether policy rules are local or cloud-backed, and how many are applicable
- recommended next steps when coverage or tooling is incomplete

## Install Missing

```sh
lint install missing .
lint install missing src/
lint install missing --dry-run .
```

`lint install missing` uses project detection to find suggested linters that are still missing, shows why they were suggested, and can install them with the linter-specific install command.

## Bootstrap

```sh
lint bootstrap
lint bootstrap --dry-run
lint bootstrap --json
lint bootstrap --install-missing --install-hooks
```

`lint bootstrap` is the non-interactive counterpart to `lint init`. It detects the project, writes a repo-local `.lintrc.yaml`, creates a local `.lint/config` when needed, and can optionally install missing linters and hooks.

## Setup Fix

```sh
lint setup fix
lint setup fix --dry-run
lint setup fix --json
lint setup fix --no-install-missing --no-install-hooks
```

`lint setup fix` is the one-shot setup repair flow. It writes the recommended `.lintrc.yaml`, creates a local `.lint/config` when missing, and by default also installs missing suggested linters and managed hooks.

## Recommended Config

```sh
lint config recommend
lint config recommend --json
lint config recommend --write
```

`lint config recommend` builds a recommended `.lintrc.yaml` from project detection and current defaults. It preserves existing custom sections like `rules`, `output`, hook overrides, and custom ignore patterns.

## JSON Output

`lint --format json` now returns a stable machine-readable payload with:

- `schema_version` and `kind` fields for consumer-side compatibility checks
- summary counts
- per-linter and per-file offenses
- run metadata such as cwd, mode, requested paths, file count, selected linters, and policy rule count
- a message field for empty or skipped runs
- explicit `status` and `exit_code` fields for CI and orchestration consumers
- a `decisions` block with ignored files, linter selection reasons, and cloud-vs-local policy summary
- file coverage details showing which selected linters handled which files, plus why uncovered files were skipped

For automation consumers that only need a compact health/result snapshot, use:

```sh
lint machine summary .
lint machine summary --strict .
```

The compact summary also includes structured `actions` with ready-to-run commands like `lint install missing .`, `lint setup fix --dry-run`, or `lint explain run .`, so a control plane can guide remediation without parsing prose.
It also exposes explicit `signals` booleans like `needs_setup`, `has_missing_selected_linters`, and `has_uncovered_files` for lightweight consumers.
For even simpler consumers, it now includes a top-level `status`, stable `blocking_reasons` / `warning_reasons`, and a `primary_action`.
Use `--strict` when a shell script should fail fast on setup gaps or uncovered files without parsing JSON.

## CI / Quality Gate

```sh
lint ci
lint ci --format text
lint ci src/
lint ci --allow-warnings
```

`lint ci` is the repo-local quality gate mode:

- defaults to linting the whole project (`.`)
- defaults to JSON output for machine consumers
- fails on warnings by default with exit code `2`
- can be relaxed with `--allow-warnings`

## Development

```sh
git clone https://github.com/osmove/lint.git
cd lint
npm install
npm run verify            # Full maintainer check: typecheck, lint, audit, build, package, gate, tests
npm run build             # Build TypeScript → dist/
npm run package:check     # Verify the published npm package contents
npm run quality-gate      # Run Lint against the whole repo
npm run security:audit    # Fail on moderate+ dependency vulnerabilities
npm test                  # Run the Vitest suite
npm run typecheck         # Type check
npm run lint              # Lint with Biome
```

`npm publish` now reuses the same `npm run verify` gate through `prepublishOnly`, so local publishes cannot skip the full maintainer validation pass. `npm run verify` also checks the npm package payload with `npm pack --dry-run`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the maintainer workflow, CLI conventions, and release hygiene checklist.

### Tech Stack

- TypeScript (strict), ESM
- Build: tsup → Node 20+
- Tests: Vitest
- CI: GitHub Actions (Node 20 + 22)
- AI: Anthropic SDK (Claude)

## License

[Apache-2.0](./LICENSE)

## Website

[https://lint.to](https://lint.to)
