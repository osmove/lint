# Lint

Lint is a universal code linting CLI that orchestrates multiple language-specific linters through a single interface. It connects to a cloud API (`api.lint.to`) for policy-based rule management, integrates with git hooks, and provides AI-powered code review via Codex.

**npm package**: `lint` (global command: `lint`)

## Architecture

```
src/
├── index.ts           → CLI entry point (commander.js)
├── types.ts           → TypeScript interfaces (LintReport, RunOptions, etc.)
├── config.ts          → Constants, paths, supported extensions
├── utils.ts           → Shared utilities (exec, file helpers, git root)
├── rc.ts              → .lintrc.yaml config loader, conflict resolution
├── detect.ts          → Project auto-detection (languages, frameworks, linters)
├── api.ts             → HTTP client for api.lint.to (native fetch)
├── auth.ts            → User authentication (login/signup/logout)
├── git.ts             → Git operations (staged files, hooks, init wizard)
├── orchestrator.ts    → Main linting engine (parallel, JSON output, dry-run)
├── reporter.ts        → Terminal + JSON output formatting
├── linters/
│   ├── base.ts        → Abstract BaseLinter class
│   ├── eslint.ts      → ESLint (JavaScript/TypeScript)
│   ├── prettier.ts    → Prettier (code formatting)
│   ├── rubocop.ts     → RuboCop (Ruby)
│   ├── erblint.ts     → erb-lint (ERB templates)
│   ├── brakeman.ts    → Brakeman (Rails security)
│   ├── stylelint.ts   → Stylelint (CSS/SCSS)
│   ├── pylint.ts      → Pylint (Python)
│   ├── biome.ts       → Biome (JS/TS/CSS/JSON — Rust-based)
│   ├── ruff.ts        → Ruff (Python — Rust-based)
│   └── oxlint.ts      → oxlint (JS/TS — Rust-based)
└── ai/
    ├── client.ts      → Anthropic SDK wrapper (streaming, key management)
    ├── review.ts      → AI code review of staged changes
    ├── fix.ts         → AI auto-fix suggestions
    ├── commit.ts      → AI commit message generation
    └── explain.ts     → AI explanation of linting errors
```

## How It Works

1. User runs `lint`, `lint .`, or `lint src/`
2. `.lintrc.yaml` is loaded for config (linter selection, ignore patterns, fix strategy)
3. Files are resolved: staged files (default), or from specified paths
4. Ignore patterns are applied, files categorized by extension
5. Linter conflicts auto-resolved (Biome replaces ESLint/Prettier/oxlint)
6. Policy rules fetched from API (optional, works offline)
7. Linters run in parallel (different languages) or sequential (same files)
8. Results aggregated, displayed as text/JSON, with spinners
9. Report sent to API (if connected)

## Development

```bash
node -v              # Requires Node.js >= 20
npm install          # Install dependencies
npm run build        # Build with tsup → dist/
npm run dev          # Watch mode
npm run test         # Run tests with Vitest (80 tests)
npm run typecheck    # TypeScript type checking
npm run lint         # Lint with Biome
```

## Configuration

### .lintrc.yaml (per-project)

```yaml
linters:
  enabled: [biome, ruff, rubocop]
  disabled: [eslint, oxlint]
ignore:
  - node_modules/**
  - dist/**
fix:
  enabled: true
  strategy: formatter-first
hooks:
  timeout: 60
  skip_env: LINT_SKIP
```

### Other config files

- `.lint/config` — Repo UUID, cloud connection (YAML)
- `~/.lint/refs/user` — Stored username
- `~/.lint/refs/token` — Stored API token
- `~/.lint/ai-config` — Anthropic API key (JSON)
- `ANTHROPIC_API_KEY` env var — Alternative API key source
- `LINT_API_URL` env var — Override API base URL

## Key Commands

```bash
lint                    # Lint staged files (default)
lint .                  # Lint entire project
lint src/               # Lint specific directory
lint file.ts            # Lint specific file
lint --fix              # Auto-fix issues
lint --fix --dry-run    # Preview fixes without applying
lint --format json      # JSON output for CI/CD
lint -q                 # Quiet mode (summary only)
lint pre-commit -t      # Pre-commit hook with timing
lint init               # Smart setup wizard
lint doctor             # Diagnose setup health
lint ai review          # AI code review
lint ai fix             # AI auto-fix suggestions
lint ai commit          # AI commit message generation
lint ai explain         # Explain linting errors
lint ai setup           # Configure Anthropic API key
lint install:hooks      # Install git hooks
lint login / signup     # Authentication
```

## Adding a New Linter

1. Create `src/linters/newlinter.ts` extending `BaseLinter`
2. Implement: `createConfig()`, `run()`, `parseOutput()`
3. Add extensions to `SUPPORTED_EXTENSIONS` in `src/config.ts`
4. Register the linter in `ALL_LINTERS` array in `src/orchestrator.ts`
5. Add to `LINTER_REPLACEMENTS` in `src/rc.ts` if it replaces another
6. Add detection rules in `src/detect.ts`
7. Add tests in `tests/linters.test.ts`
