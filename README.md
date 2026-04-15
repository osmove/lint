![Omnilint logo](./assets/images/logo-dark.png#gh-dark-mode-only)
![Omnilint logo](./assets/images/logo-light.png#gh-light-mode-only)

**The universal linter.** One CLI to lint any language — now with AI-powered code review.

[![npm version](https://img.shields.io/npm/v/lint.svg)](https://www.npmjs.com/package/lint)
[![license](https://img.shields.io/npm/l/lint.svg)](https://github.com/omnilint/lint/blob/master/LICENSE)

---

## What is Omnilint?

Omnilint wraps multiple language-specific linters into a single CLI. Instead of configuring ESLint, Rubocop, Ruff, Biome, and Stylelint separately, run one command:

```sh
lint
```

It detects your languages, applies your team's policy, and lints everything — JavaScript, TypeScript, Python, Ruby, CSS, and more.

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
- **Git hooks** — Automatic pre-commit linting
- **Policy-driven** — Centralized rules for your team via cloud config
- **AI-powered** — Code review and auto-fix with Claude *(coming soon)*
- **Zero config** — Smart defaults, customize when you need to

## Supported Linters

| Language | Linter | Status |
|----------|--------|--------|
| JavaScript / TypeScript | ESLint, Biome | Supported |
| Python | Ruff, Pylint | Supported |
| Ruby | RuboCop | Supported |
| CSS / SCSS | Stylelint | Supported |
| ERB Templates | erb-lint | Supported |
| Ruby on Rails | Brakeman (security) | Supported |
| Code Formatting | Prettier | Supported |

## Commands

### Linting

```sh
lint                      # Lint staged files (default)
lint pre-commit           # Run pre-commit hook
lint pre-commit -t        # Show execution time
lint pre-commit -T        # Truncate output (first 10 offenses)
lint:staged               # Lint staged files
prettify <ext>            # Run Prettier on all files with extension
```

### Setup

```sh
lint init                 # Initialize repository
lint install:hooks        # Install git hooks
lint install:eslint       # Install ESLint
lint install:rubocop      # Install Rubocop
lint install:stylelint    # Install Stylelint
lint install:erblint      # Install ERB Lint
lint install:brakeman     # Install Brakeman
```

### Account

```sh
lint signup               # Create an account
lint login                # Sign in
lint logout               # Sign out
lint whoami               # Current user status
```

### AI (coming soon)

```sh
lint ai:review            # AI-powered code review of staged changes
lint ai:fix               # Intelligent auto-fix suggestions
lint ai:explain           # Explain linting errors in plain language
lint ai:config            # Generate linter config from AI analysis
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
node index.js
```

## License

[Apache-2.0](./LICENSE)

## Website

[https://www.omnilint.com](https://www.omnilint.com)
