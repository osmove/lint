# Omnilint (lint)

Omnilint is a universal code linting CLI that orchestrates multiple language-specific linters through a single interface. It connects to a cloud API (`api.omnilint.com`) for policy-based rule management and integrates with git hooks for automated linting.

**npm package**: `lint` (global command: `lint` or `omnilint`)

## Architecture

```
index.js              → CLI entry point (commander.js)
utils/
├── linter.js         → Core linting orchestration (fetches policies, runs linters)
├── user.js           → Authentication (login/signup/logout via API)
├── initializer.js    → Repository initialization (creates .lint/ directory)
├── filesHandler.js   → File I/O, git operations, .lint directory management
├── hooks.js          → Git hook installation/management
├── repository.js     → API calls for repository CRUD
├── organization.js   → Organization management
├── ascii-filter.js   → Output filtering
└── linters/          → Language-specific linter wrappers
    ├── eslint.js     → JavaScript/TypeScript (ESLint)
    ├── prettier.js   → Code formatting (Prettier)
    ├── ruboCop.js    → Ruby (RuboCop)
    ├── erbLint.js    → ERB templates (erb-lint)
    ├── brakeman.js   → Rails security (Brakeman)
    ├── stylelint.js  → CSS/SCSS (Stylelint)
    └── pylint.js     → Python (Pylint)
```

## How It Works

1. User runs `lint` or `lint pre-commit`
2. CLI fetches staged files via `simple-git`
3. Files are categorized by extension (`.js`, `.rb`, `.py`, `.scss`, etc.)
4. Policy rules are fetched from `https://api.omnilint.com`
5. Linter configs are dynamically generated in `.lint/tmp/`
6. Each linter runs via `child_process.execSync`
7. Output is parsed and displayed with `chalk` + `cli-table`

## Development

```bash
node -v          # Requires Node.js (currently no minimum version set)
npm install      # Install dependencies
node index.js    # Run locally
```

### Key Commands

```bash
lint                    # Lint staged files (default action)
lint init               # Initialize repo with Omnilint
lint install:hooks      # Install git hooks
lint pre-commit         # Run pre-commit hook
lint login / signup     # Authentication
```

## Configuration

- `.lint/config` — Local repo config (contains repo UUID)
- `~/.lint/refs/user` — Stored username
- `~/.lint/refs/token` — Stored API token
- `.lintstagedrc` — lint-staged integration config

## API

- **Base URL**: `https://api.omnilint.com`
- **Dev URL**: `http://localhost:3000`
- Authentication: username + token passed as query params

## Known Issues (pre-modernization)

- `install:stylelint` calls `installRubocop()` instead of `installStylelint()` (bug)
- `install:rubocop` references an uncommented import (will crash)
- `loadash` dependency is a typo — not `lodash`, it's an empty/suspect package
- `request` library is deprecated since 2020
- No tests, no CI/CD, no TypeScript
- Backup files in repo (`index copy.js`, `linters-backup-jan-2019/`)

## Build & Test

Currently no build step or test suite. Modernization plan targets:
- TypeScript with `tsup` for building
- Vitest for testing
- GitHub Actions for CI/CD
- Biome for self-linting
