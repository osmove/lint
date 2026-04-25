# Changelog

## [Unreleased]

### Added

- `lint hooks:status` to inspect managed hook state from the CLI
- richer `lint doctor` output with branch and dirty/clean repo status
- `lint doctor --json` for machine-readable health reporting
- `lint ci` as a repo-local quality gate command for CI and orchestration
- `npm run quality-gate` so the repo can run Lint against itself in CI
- offline API tests using mocked `fetch` instead of real network calls
- doctor module coverage with dedicated tests
- richer `lint doctor --json` project and linter selection metadata for machine consumers
- `lint explain run` to inspect run decisions in text or JSON without executing linters
- enriched `lint explain run` with resolved conflicts, fix strategy, and recommended next steps
- `lint install missing` to turn missing-linter diagnostics into a direct action
- `lint bootstrap` for non-interactive repo-local setup and automation-friendly bootstrapping
- `lint config recommend` to preview or write a recommended `.lintrc.yaml`
- `lint setup fix` to apply recommended repo-local setup in a single command
- versioned machine-readable outputs with explicit `schema_version` and `kind`
- `lint machine summary` for a compact automation-focused JSON snapshot
- structured `actions` in `lint machine summary` so automation consumers can trigger the right remediation commands directly
- `lint machine summary --strict` to expose a simple non-zero shell signal for setup or coverage gaps
- explicit `signals` booleans in `lint machine summary` so consumers do not need to derive health from counts
- top-level `status`, `blocking_reasons`, `warning_reasons`, and `primary_action` in `lint machine summary` for simpler control-plane integration
- canonical hook commands are now grouped under `lint hooks <install|status|uninstall>`, with legacy aliases kept for compatibility
- canonical setup-style commands are now grouped under namespaces like `lint setup fix`, `lint config recommend`, `lint install missing`, and `lint machine summary`, with legacy colon aliases kept for compatibility
- canonical account commands are now grouped under `lint auth <login|logout|signup|whoami>`, with flat aliases kept for compatibility
- internal hook entrypoints like `lint pre-commit` stay available but are now hidden from the root help output to keep the primary CLI surface clean
- `lint auth status` is now the canonical status command, while `auth whoami` and top-level `whoami` remain compatibility aliases
- `lint setup bootstrap` and `lint setup doctor` are now the canonical setup/diagnostic entrypoints, while top-level `bootstrap` and `doctor` remain compatibility aliases
- `lint format write <extension>` is now the canonical formatting helper, while `prettify <extension>` remains a compatibility alias
- `lint explain run` is now the canonical explain helper, while `explain-run` remains a compatibility alias
- `lint setup init` is now the canonical interactive setup command, while top-level `init` remains a compatibility alias
- added `npm run verify` as a full maintainer validation pass, and aligned README examples with the grouped canonical CLI surface
- added `npm run security:audit` and wired it into CI so moderate+ dependency vulnerabilities fail the pipeline earlier

### Changed

- aligned Git and hook management with Cockpit-style managed hook patterns
- made hook execution portable on macOS by removing the dependency on GNU `timeout`
- switched linter process execution to argv-based command spawning for safer path handling
- improved staged file discovery using `git diff --cached --name-status -z`
- improved project detection across nested files and framework signals
- made Biome diagnostics report better line/column positions when source spans are available
- defaulted linter execution back to repo-local configs unless cloud policy rules explicitly override them
- enriched JSON output with stable run metadata for CI and orchestration consumers
- added explicit JSON `status`, `exit_code`, and `requested_paths` fields
- normalized empty and skipped JSON runs onto the same output schema
- aligned warning failures across CLI exit codes and machine-readable output
- added machine-readable run decisions for ignored files, linter selection, and policy origin
- added file coverage and applicable policy-rule counts to machine-readable run decisions
- refined uncovered-file reasons to distinguish unknown types, missing installs, and selection/configuration gaps
- made `prepublishOnly` run `npm run verify` so package publishes reuse the full maintainer safety gate
- extended `npm run verify` with `npm pack --dry-run` so maintainers validate the publish payload before release
- added `npm run package:check` to CI so packaging regressions fail before publish
- aligned maintainer docs with the grouped canonical CLI surface and removed drift-prone hard-coded test counts
- aligned `CLAUDE.md` with the current maintainer surface and removed the unused shell-string `exec()` helper from `utils`
- added `CONTRIBUTING.md` to document maintainer workflow, canonical CLI conventions, and release hygiene in one place
- renamed default branch from `master` to `main`, aligned CI triggers and README badges
- patched postcss XSS advisory (GHSA-qx2v-qp2m-jg93)
- added `.github/PULL_REQUEST_TEMPLATE.md` to keep PR submissions aligned with `CONTRIBUTING.md`
- promoted `lint init`, `lint bootstrap`, and `lint doctor` to top-level canonical commands (matching `npm init`, `git init` conventions); the grouped forms `lint setup init`, `lint setup bootstrap`, and `lint setup doctor` are kept as hidden legacy aliases
- restricted auto-mode linter selection to project-applicable linters, so a globally-installed Ruby linter is no longer auto-selected on a TypeScript-only repo

## [1.0.0] - 2026-04-15

### Breaking Changes

- Requires Node.js >= 20 (dropped support for older versions)
- Complete rewrite in TypeScript — all imports/exports changed
- Removed deprecated `request` HTTP library (uses native `fetch`)
- Removed `loadash`, `moment`, `ora`, `cli-table`, `write-yaml`, `replace-in-file` dependencies
- Package is now ESM-only (`"type": "module"`)
- Binary entry point moved from `./index.js` to `./dist/index.js`

### Added

- **AI-powered code analysis** via Claude (Anthropic SDK)
  - `lint ai review` — AI code review of staged changes
  - `lint ai fix` — AI-powered auto-fix suggestions
  - `lint ai explain` — Explain linting errors in plain language
  - `lint ai setup` — Configure Anthropic API key
- **3 new Rust-based linters** for dramatically faster linting:
  - Biome (JS/TS/CSS/JSON)
  - Ruff (Python)
  - oxlint (JS/TS)
- `--fix` flag for auto-fixing issues across all supported linters
- `--verbose` flag for detailed output
- `lint uninstall:hooks` command
- Offline mode — works without API connection
- TypeScript strict mode throughout
- Vitest test suite (33+ tests)
- GitHub Actions CI/CD pipeline (Node 20 + 22 matrix)
- Biome for self-linting
- `vitest.config.ts`, `tsconfig.json`, `tsup.config.ts`, `.editorconfig`, `.nvmrc`

### Changed

- Updated `chalk` 2.x → 5.x
- Updated `commander` 2.x → 13.x
- Updated `inquirer` 6.x → `@inquirer/prompts` 7.x
- Updated `prettier` 1.x → 3.x
- Updated `js-yaml` 3.x → 4.x
- Updated `simple-git` 3.15 → 3.27
- Replaced `cli-table` with `cli-table3`
- Replaced `ora` with `nanospinner`
- Replaced callback-based HTTP with native `fetch`
- Refactored all linters into `BaseLinter` abstract class

### Fixed

- `install:stylelint` was calling `installRubocop()` instead of `installStylelint()`
- `install:rubocop` referenced an unimported function
- Removed `loadash` typo dependency (was not `lodash`)
- Fixed non-null assertion patterns throughout codebase
- Fixed error count misattribution in report aggregation
- Proper error handling for all `execSync` calls

### Removed

- Backup files: `index copy.js`, `utils/linters-backup-jan-2019/`
- Dead code: commented-out imports and unused functions
- `preferGlobal` deprecated field from `package.json`
- `postinstall` echo script

## [0.8.19] - 2022-12-08

- Last release before modernization
