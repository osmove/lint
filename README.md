![Omnilint logo](./assets/images/logo-dark.png#gh-dark-mode-only)
![Omnilint logo](./assets/images/logo-light.png#gh-light-mode-only)

**The universal linter.** One CLI to lint any language — with AI-powered code review.

[![npm version](https://img.shields.io/npm/v/lint.svg)](https://www.npmjs.com/package/lint)
[![license](https://img.shields.io/npm/l/lint.svg)](https://github.com/omnilint/lint/blob/master/LICENSE)
[![CI](https://github.com/omnilint/lint/actions/workflows/ci.yml/badge.svg)](https://github.com/omnilint/lint/actions/workflows/ci.yml)

---

## What is Omnilint?

Omnilint wraps multiple language-specific linters into a single CLI. Instead of configuring ESLint, Rubocop, Ruff, Biome, and Stylelint separately, run one command:

```sh
lint
```

It auto-detects your languages, applies your team's policy, and lints everything — JavaScript, TypeScript, Python, Ruby, CSS, and more.

## Quick Start

```sh
# Install globally
npm i -g lint

# Navigate to your project
cd /path/to/your/repo

# Initialize
lint init

# Lint your staged files
lint
```

Or install locally:

```sh
npm i -D lint
npx lint
```

## Features

- **Multi-language** — One tool for JS, TS, Python, Ruby, CSS, ERB, and more
- **10 linters** — ESLint, Biome, oxlint, Prettier, RuboCop, Stylelint, Pylint, Ruff, Brakeman, erb-lint
- **Git hooks** — Automatic pre-commit linting
- **AI-powered** — Code review, auto-fix suggestions, and error explanations with Claude
- **Policy-driven** — Centralized rules for your team via cloud config
- **Zero config** — Smart defaults, customize when you need to
- **Fast** — Rust-based linters (Biome, Ruff, oxlint) for instant feedback

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

## Commands

### Linting

```sh
lint                      # Lint staged files (default)
lint pre-commit           # Run pre-commit hook
lint pre-commit -t        # Show execution time
lint pre-commit -T        # Truncate output (first 10 offenses)
lint lint:staged          # Lint staged files
lint prettify <ext>       # Run Prettier on all files with extension
```

### AI (powered by Claude)

```sh
lint ai setup             # Configure your Anthropic API key
lint ai review            # AI code review of staged changes
lint ai fix               # AI-powered auto-fix suggestions
```

Set your API key via `lint ai setup` or the `ANTHROPIC_API_KEY` environment variable.

### Setup

```sh
lint init                 # Initialize repository
lint install:hooks        # Install git hooks
lint uninstall:hooks      # Remove git hooks
```

### Account

```sh
lint signup               # Create an account
lint login                # Sign in
lint logout               # Sign out
lint whoami               # Current user status
```

## Git Hooks

Install git hooks to lint automatically on every commit:

```sh
lint install:hooks
```

This installs `pre-commit`, `prepare-commit-msg`, and `post-commit` hooks.

## Configuration

Omnilint stores its configuration in the `.lint/` directory at the root of your repository. Team-wide policies are managed through the Omnilint cloud dashboard.

## Development

```sh
git clone https://github.com/omnilint/lint.git
cd lint
npm install
npm run build             # Build TypeScript → dist/
npm test                  # Run tests
npm run typecheck         # Type check
npm run lint              # Lint with Biome
```

### Tech Stack

- TypeScript (strict), ESM
- Build: tsup → Node 20+
- Tests: Vitest (33 tests)
- CI: GitHub Actions (Node 20 + 22)
- AI: Anthropic SDK (Claude)

## License

[Apache-2.0](./LICENSE)

## Website

[https://www.omnilint.com](https://www.omnilint.com)
