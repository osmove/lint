# Lint

**The universal linter.** One CLI to lint any language — with AI-powered code review.

[![npm version](https://img.shields.io/npm/v/lint.svg)](https://www.npmjs.com/package/lint)
[![license](https://img.shields.io/npm/l/lint.svg)](https://github.com/osmove/lint/blob/master/LICENSE)
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
lint init                 # Smart setup wizard with auto-detection
lint doctor               # Diagnose setup, linters, hooks health
lint doctor --json        # Machine-readable health report
lint ci --allow-warnings  # Quality gate but keep warnings non-blocking
lint hooks:status         # Inspect managed hook status
lint install:hooks        # Install git hooks
lint uninstall:hooks      # Remove git hooks
```

### Account

```sh
lint signup / login / logout / whoami
```

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
lint install:hooks
lint hooks:status
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
- installed vs enabled linters
- managed vs unmanaged git hooks

Use `lint doctor --json` when you want to consume the report from another tool, CI step, or control plane.

## JSON Output

`lint --format json` now returns a stable machine-readable payload with:

- summary counts
- per-linter and per-file offenses
- run metadata such as cwd, mode, requested paths, file count, selected linters, and policy rule count
- a message field for empty or skipped runs
- explicit `status` and `exit_code` fields for CI and orchestration consumers

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
npm run build             # Build TypeScript → dist/
npm run quality-gate      # Run Lint against the whole repo
npm test                  # Run tests (94 tests, 10 suites)
npm run typecheck         # Type check
npm run lint              # Lint with Biome
```

### Tech Stack

- TypeScript (strict), ESM
- Build: tsup → Node 20+
- Tests: Vitest (94 tests, 10 suites)
- CI: GitHub Actions (Node 20 + 22)
- AI: Anthropic SDK (Claude)

## License

[Apache-2.0](./LICENSE)

## Website

[https://lint.to](https://lint.to)
