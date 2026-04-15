# Omnilint (lint)

Omnilint is a universal code linting CLI that orchestrates multiple language-specific linters through a single interface. It connects to a cloud API (`api.omnilint.com`) for policy-based rule management, integrates with git hooks, and provides AI-powered code review via Claude.

**npm package**: `lint` (global command: `lint` or `omnilint`)

## Architecture

```
src/
├── index.ts           → CLI entry point (commander.js)
├── types.ts           → TypeScript interfaces (LintReport, PolicyRule, etc.)
├── config.ts          → Constants, paths, supported extensions
├── utils.ts           → Shared utilities (exec, file helpers, git root)
├── api.ts             → HTTP client for api.omnilint.com (native fetch)
├── auth.ts            → User authentication (login/signup/logout)
├── git.ts             → Git operations (staged files, hooks, init)
├── orchestrator.ts    → Main linting orchestration engine
├── reporter.ts        → Terminal output formatting (chalk + cli-table3)
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
    └── explain.ts     → AI explanation of linting errors
```

## How It Works

1. User runs `lint` or `lint pre-commit`
2. CLI gets staged files via `git status -s`
3. Files are categorized by extension and matched to available linters
4. Policy rules are fetched from the API (optional, works offline)
5. Linter configs are dynamically generated in `.lint/tmp/`
6. Each linter runs via `child_process.execSync`, output parsed as JSON
7. Results are aggregated and displayed with spinners + colored output
8. Report is sent to API (if connected)

## Development

```bash
node -v              # Requires Node.js >= 20
npm install          # Install dependencies
npm run build        # Build with tsup → dist/
npm run dev          # Watch mode
npm run test         # Run tests with Vitest
npm run typecheck    # TypeScript type checking
npm run lint         # Lint with Biome
```

### Running locally

```bash
node dist/index.js          # Run built version
npx tsx src/index.ts        # Run directly from source
```

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Build**: tsup (ESM output, targeting Node 20)
- **Tests**: Vitest
- **Linting**: Biome (self-linting)
- **CI/CD**: GitHub Actions (Node 20 + 22 matrix)
- **Dependencies**: chalk 5, commander 13, @inquirer/prompts 7, @anthropic-ai/sdk

## Configuration

- `.lint/config` — Local repo config (YAML, contains repo UUID)
- `~/.lint/refs/user` — Stored username
- `~/.lint/refs/token` — Stored API token
- `~/.lint/ai-config` — Anthropic API key (JSON)
- `ANTHROPIC_API_KEY` env var — Alternative API key source
- `OMNILINT_API_URL` env var — Override API base URL

## API

- **Base URL**: `https://api.omnilint.com` (configurable via `OMNILINT_API_URL`)
- Authentication: `user_token` query parameter
- All requests use native `fetch` (no external HTTP library)

## Adding a New Linter

1. Create `src/linters/newlinter.ts` extending `BaseLinter`
2. Implement: `createConfig()`, `run()`, `parseOutput()`
3. Add extensions to `SUPPORTED_EXTENSIONS` in `src/config.ts`
4. Register the linter in `ALL_LINTERS` array in `src/orchestrator.ts`
5. Add tests in `tests/linters.test.ts`

## Key Commands

```bash
lint                    # Lint staged files (default)
lint pre-commit -t      # Pre-commit hook with timing
lint ai review          # AI code review
lint ai fix             # AI auto-fix suggestions
lint ai setup           # Configure Anthropic API key
lint init               # Initialize repository
lint install:hooks      # Install git hooks
lint login / signup     # Authentication
```
