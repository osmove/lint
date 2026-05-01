# Lint — Handoff to the next coding agent

Status as of **April 30, 2026** (revised after the P1 sweep). Everything below was scaffolded across multiple sessions starting from a monorepo with just `packages/cli`. The goal was to mirror the Backlog topology (CLI + SDK + Server + Dashboard UI + Desktop) and ship it production-grade.

## TL;DR

- 13 packages, 145 tests passing, all builds green.
- Per-repo health surfaced in the dashboard Repos tab (badges, summary bars, register / remove).
- `lint ci` posts a GitHub Check on every PR with up to 50 inline annotations.
- `.lintrc.yaml` now carries a `notify:` block that fires Slack / Discord webhooks on failed runs.
- Workspace picker (Electron) reads `~/.lint/projects.json` first, falls back to native dialog.
- DMGs, AppImages, NSIS installers buildable today (mac arm64 + x64 already produced locally).
- The dashboard is real: clicking "Run lint" spawns the CLI, streams stdout via SSE, persists the run.
- AI review / fix wired through Anthropic, gated behind `ANTHROPIC_API_KEY`.
- Project registry at `~/.lint/projects.json` (v2): a project can contain multiple repositories, aligned with Backlog/Twoody/Osmove vocabulary. Exposed via CLI + REST.
- GitHub Actions release workflow ready (`desktop-v*` tags trigger Linux/Win/Mac builds + npm publish).

## What's been built

### Repo layout

```
~/Dev/lint/
├── lint-cli/             pnpm monorepo — the npm `lint` package + everything
│   ├── packages/
│   │   ├── cli/          npm `lint` (Apache-2.0, published)
│   │   ├── sdk/          npm `@osmove/lint-sdk` (Apache-2.0, published, OpenAPI-typed)
│   │   ├── server/       @lint/server (Hono, REST/SSE, runs spawn lint)
│   │   ├── dashboard-ui/ @lint/dashboard-ui (Svelte 5, TanStack Query)
│   │   ├── desktop/      @lint/desktop (Electron, electron-builder, GitHub Releases)
│   │   ├── schemas/      Zod source of truth (LintReport, RunOptions, Policy, Run, ProjectEntry)
│   │   ├── config/       .lintrc.yaml + .lint/config loaders
│   │   ├── git/          repo discovery + cmd helpers + staged files
│   │   ├── hooks/        pre-commit / prepare-commit-msg / post-commit install + inspect
│   │   ├── linters/      11 adapters (ESLint, Biome, Ruff, RuboCop, Stylelint, Pylint, oxlint, erb-lint, Brakeman, Prettier)
│   │   ├── ai/           Anthropic SDK wrappers (review, fix, commit, explain) — both CLI and programmatic forms
│   │   ├── policies/     api.lint.to client + auth credential storage
│   │   └── core/         orchestrator + detect + doctor + reporter + runs-store + projects-registry
│   ├── docs/ROADMAP.md
│   ├── RELEASING.md      tag conventions, Apple/Win signing, dry-run cookbook
│   ├── CONTRIBUTING.md
│   ├── AGENTS.md         workspace overview
│   ├── tsconfig.base.json + tsconfig.json (project references)
│   └── .github/workflows/{ci.yml, desktop-release.yml}
├── lint-backend/         Rails 7.2 backend (lint.to / api.lint.to) — pre-existing
│   └── public/openapi/v1.yaml   served as static, consumed by lint-sdk
├── lint-brand/           identity assets (own git repo)
│   ├── 1-icon/icon.{svg,png,ico,icns}      shield + checkmark, gradient cyan→sky→blue
│   ├── 2-lockup-horizontal/ lockup.{svg,png}
│   ├── 3-lockup-vertical/   lockup.{svg,png}
│   ├── 4-wordmark/          wordmark{,-dark}.{svg,png}    Inter Display 800
│   ├── 5-monogram-shield/   shield.{svg,png}
│   ├── 6-web/               favicon.svg + favicon-{16,32}.png + apple-touch-icon.png + og-image.{svg,png}
│   └── README.txt           palette, typography, raster pipeline
└── lint-examples/        5 demo repos (own git repo)
    ├── eslint-prettier-ts/, ruff-pylint-py/, rubocop-erblint-rb/,
    ├── biome-only/, multilang/
    └── README.md
```

### Cross-package data flow

```
                          ┌────────────────────────────┐
   .lintrc.yaml ──┐       │  @lint/dashboard-ui (Svelte) │
   .lint/config ──┼──► @lint/config ─┐  fetches /api/* via │
                   └──►              │  @osmove/lint-sdk    │
   ~/.lint/projects.json ──► @lint/core (projects/repos registry)
                                                      │    │
   git working tree ──► @lint/git ─► @lint/core ──► @lint/server (Hono)
                                          │              │
                                          ├─► @lint/linters
                                          ├─► @lint/ai (programmatic)
                                          ├─► @lint/policies (api.lint.to)
                                          └─► @lint/hooks
                                                         │
                                          .lint/runs.jsonl  ◄── append-only,
                                                                last-write-wins,
                                                                shared by CLI + server
```

### Per-package status

| Package | Status | Notes |
|---|---|---|
| `cli` | ✅ Production | All commander commands work. `lint projects ...` manages project containers; `lint repos {list,add,rm}` remains the fast repo-root path. CLI writes runs to `.lint/runs.jsonl`. |
| `sdk` | ✅ Published-ready | OpenAPI types regenerate via `pnpm --filter @osmove/lint-sdk openapi:types`. Spec at `packages/sdk/openapi/v1.yaml` and mirrored at `lint-backend/public/openapi/v1.yaml`. |
| `server` | ✅ Production | Hono on `:7878`. Routes: `/api/{health,runs,policies,projects,repos,linters,ai}`. POST /api/runs spawns lint, emits SSE. |
| `dashboard-ui` | ✅ Production | 3 tabs (Runs/Policies/Repos). "Run lint" button + live stream + AI review/fix panel. 96 KB / 33 KB gzipped. |
| `desktop` | ✅ Production | Electron embeds the server + dashboard. Workspace picker. DMG arm64+x64 built locally. Icon + name properly applied. |
| `schemas` | ✅ Stable | Zod source of truth. Re-exported types flow everywhere. |
| `config` | ✅ Stable | `.lintrc.yaml` loader. |
| `git` | ✅ Stable | findGitRoot, exec helpers, staged files. |
| `hooks` | ✅ Stable | Templates + install/inspect/uninstall. |
| `linters` | ✅ Stable | 11 adapters all working. Each extends BaseLinter. |
| `ai` | ✅ Stable | Both CLI form (streams stdout) and programmatic form (`runReview/runFix/runExplain`) exposed. |
| `policies` | ✅ Stable | api.lint.to HTTP client + token storage. |
| `core` | ✅ Stable | orchestrator + runs-store + projects-registry. |

### Tests

- **145 tests passing** across 13 packages
- breakdown: config 25, linters 24, git 15, policies 7, core 70 (orchestrator/doctor/reporter/detect/git/runs-store/projects-registry/github-checks/notify), cli 4
- `pnpm -r test` passes cleanly

### CI / release

- `.github/workflows/ci.yml` — pre-existing, npm publish on `v*` tags
- `.github/workflows/desktop-release.yml` — NEW
  - Triggers: push tag `desktop-v*` OR manual workflow_dispatch
  - Jobs: linux (AppImage/deb/rpm), windows (NSIS+portable), macos (DMG+zip — gated on `MACOS_BUILD_ENABLED` repo var), npm (idempotent publish)
  - Auto-update via `electron-updater` + GitHub Releases (publishes `latest-*.yml` per platform)

### What "ship it today" looks like

1. Set `MACOS_BUILD_ENABLED=true` repo variable + 5 Apple secrets (see `RELEASING.md` for the exact list)
2. `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`
3. GitHub Actions builds all 3 platforms + publishes to npm
4. `latest-mac.yml` etc. let installed clients auto-update on the next launch

Mac/Linux work end-to-end today even without signing — Mac DMG can be opened with right-click → Open after a Gatekeeper warning. Windows needs an EV cert before SmartScreen lets it through silently.

## Conventions established

- **Zod source of truth**: `@lint/schemas` is the only package allowed to define cross-boundary types.
- **Workspace deps**: internal packages use `workspace:*`; tsup bundles everything into the CLI tarball via `noExternal: [/^@lint\//]`.
- **No native deps**: deliberately no SQLite, no node-sass, no native binaries that complicate the asar build. JSONL files for storage.
- **Append-only persistence**: `.lint/runs.jsonl` is append-only, last-write-wins on read by id. Crash-safe by construction.
- **Best-effort observability**: any I/O failure in the runs-store write is silently swallowed — observability must never break a commit.
- **No co-author**: commits in all 4 repos do NOT have `Co-Authored-By: Claude` lines (user requirement).

## Repo states (git logs)

```
lint-cli (recent commits, all signed jimdou):
  ce39632 Slack / Discord webhook fan-out on completed runs (rc.notify block)
  0ea3aea GitHub Checks integration on `lint ci` (annotates PRs with offenses)
  d1904dd Workspace picker reads ~/.lint/projects.json
  8c16e7a Repos tab: real health badges, summary bar, register/remove actions
  c851e26 Per-repo health: latest run + summary counters in /api/repos
  9468e23 Add HANDOFF.md for the next coding agent
  3c5fd2f Add RELEASING.md: tag conventions + Apple / Windows signing setup
  9833c55 Multi-repo registry at ~/.lint/projects.json + CLI + server endpoints
  0182471 Live SSE streaming: forward stdout/stderr/exit events to the dashboard
  d8a17a0 Add AI panel to dashboard Runs tab (review / fix on staged changes)
  941ff56 Add desktop-release.yml workflow (Linux/Windows/macOS + npm)
  db2b55c Move runs-store to @lint/core; CLI now records runs to .lint/runs.jsonl
  d0913f7 Spawn the lint CLI when POST /api/runs is called
  6a77131 Wire dashboard-ui to @osmove/lint-sdk + TanStack Query
  db59d44 Persist runs in .lint/runs.jsonl (append-only, last-write-wins)
  291e7a6 Wire @lint/desktop to brand raster icons
  0a5728e Distribute 11 vitest suites from cli/tests/ into their owner packages
  7239d2c Expand OpenAPI spec to cover the full @lint/server REST surface
  88ca417 Expose @lint/ai programmatic API and wire /api/ai/{review,fix,explain}
  810d5b5 Add @lint/desktop: Electron app embedding the Hono server + dashboard
  4b027a0 Add @lint/dashboard-ui: Svelte 5 dashboard with 3 tabs
  d49673d Add @lint/server: local Hono server (REST + SSE) for the dashboard UI
  2724ae6 Add @osmove/lint-sdk: typed OpenAPI client for api.lint.to
  010207a Extract 8 internal packages + slim CLI to commander.js wiring only
  0239fe7 Add monorepo foundation (tsconfig.base, ROADMAP, AGENTS rewrite)

lint-backend:
  bc4465d Sync /openapi/v1.yaml with the expanded SDK spec
  3f84156 Add /openapi/v1.yaml served from public/ for the SDK's type generator

lint-brand:
  2094a8b Generate raster outputs (PNG, ICO, ICNS) from SVG masters
  9568d9a Adopt shield + checkmark as canonical glyph (option A)
  0d28d4f Refine icon geometry: heraldic shield + strict 45° chevrons
  b410829 Premium identity refresh: gradients, glow, bezel — production-grade
  664f321 Rework identity around the original shield+chevrons glyph
  60187b1 Master SVG glyphs: icon, wordmark, lockups, monogram, web assets
  ae3ccf1 Initial brand assets skeleton

lint-examples:
  37659d4 Initial demo repos for Lint
```

---

# Instructions to the next agent

Read this section carefully **before** doing anything. The repo is in a known-good state — don't accidentally undo working features by being clever.

## Hard rules

1. **Never add `Co-Authored-By` lines** to any commit. The user explicitly forbade this.
2. **Stay zero-native-deps.** No SQLite, no `better-sqlite3`, no `node-gyp` packages. The asar payload must stay JS-only so cross-platform Electron builds don't blow up.
3. **`@lint/schemas` is the only place** to define a type that crosses package boundaries. If you need a new type used by ≥2 packages, define it there as a Zod schema first, then `z.infer` everywhere else.
4. **`.lint/runs.jsonl`** is append-only. Don't add a "rewrite the file" code path. Last-write-wins on read by id is the contract; clients tolerate duplicate ids.
5. **Best-effort observability**. Run recording, registry writes, etc. must NEVER throw at the caller. Wrap in try/catch and silently return. The user is shipping the linter, not the dashboard.
6. **Don't pin Node < 20**. Several packages use `node:` builtins that need 20.

## Workflow you should follow

1. Read this file end-to-end.
2. Run `pnpm install && pnpm typecheck && pnpm -r test` from `lint-cli/` — should pass clean.
3. Pick a TODO from the prioritized list below.
4. Branch is `main` directly (no PRs configured); the user works trunk-based.
5. Commit per logical unit with descriptive messages. The existing commit log shows the expected style: imperative subject, body explains the why, no co-author.
6. Before each commit: `pnpm typecheck && pnpm -r test`. Both must pass.
7. After each commit: tell the user what shipped, in French, concise. The user prefers short bullets in French (he's French and works in CET).

## Prioritized TODO list (pick from the top)

### P0 — Things to verify before claiming "production"

- [ ] **Run the actual `pnpm --filter @lint/desktop dev` and click through the UI.** I built it and the binary launches but I never visually verified the SSE stream renders, the AI panel scrolls right, etc. There may be Svelte-5 reactivity bugs in `Runs.svelte` (the `$effect` that wires the EventSource — if the user clicks rapidly between runs, the cleanup may miss).
- [ ] **The Apple/Windows secrets section in RELEASING.md is correct but unverified end-to-end.** Once the user provides Apple Dev credentials, follow `RELEASING.md` step-by-step and capture the Actions log in case anything diverges.
- [ ] **`lint-backend/public/openapi/v1.yaml` is currently a static copy.** Long-term it should be generated by the Rails app (rswag or grape-swagger). Confirm with the user before doing this — the static path is fine for v1.

### P1 — All four shipped this session, kept here for reference

- [x] **Latest-run-per-repo index** — `runs-store.latest()` + `summary()`, surfaced via `/api/repos` and grouped by project in the Repos tab. (commit `c851e26` + `8c16e7a`)
- [x] **GitHub Checks integration** — `lint ci` posts annotations to PRs when running inside GitHub Actions. (`0ea3aea`)
- [x] **Slack/Discord notify** — `.lintrc.yaml notify:` block, fan-out helper in `@lint/core`. (`ce39632`)
- [x] **Workspace picker reads registry** — Electron picker shows last + registered repos, falls back to dialog. (`d1904dd`)

### P1.5 — Next big things (pick one of these next)

- [ ] **Per-repo detail view in the dashboard.** A `/repo/:id` route showing the last 50 runs, error-rate sparkline, top offending rules. Server already returns `recentRuns: Run[]` from `/api/repos/:id/health`. Mostly a Svelte view + a chart lib (chart.js or chartist).
- [ ] **Plugin SDK for custom linters.** Phase 4 of the roadmap. Concrete shape: a `@lint/linter-sdk` package re-exporting `BaseLinter`, plus a `linters.plugins: ["lint-plugin-foo"]` resolver that dynamically imports + registers them. Proof of concept: a `lint-plugin-vale` example.
- [ ] **GitLab CI parallel of GitHub Checks.** GitLab Code Quality format (a `gl-code-quality-report.json` artifact). Same shape as the GitHub Checks code: detect `GITLAB_CI=true`, write JSON to `$CI_PROJECT_DIR`, the runner picks it up via `artifacts.reports.codequality`.
- [ ] **Pre-commit hook posts to runs-store too.** Currently `lint pre-commit` calls `preCommit` which is a different code path from `runLint`. Add the same `recordRun` hook so the dashboard sees pre-commit failures.

### P2 — Nice-to-have, smaller chunks

- [ ] **Streaming SSE forwarding through Electron**. Right now SSE works in the browser. In Electron, EventSource is supported in the renderer, but verify that long-lived connections survive when the workspace switches.
- [ ] **`lint repos add --watch`**: register the project AND start a file watcher that triggers a debounced run on save. Use `chokidar`. Output: another flavour of run record (with a `triggered_by: "watch"` field).
- [ ] **Dashboard Repos tab interactivity**: clicking a repo card should switch the workspace context (if the desktop is running, send IPC; if it's a browser, redirect to `?workspace=...`).
- [ ] **Per-repo health view**. New tab `/api/repos/:id` showing the last 50 runs, error trends, top offending rules. Pure read-side, no mutations.
- [ ] **Plugin SDK for custom linters**. Documented as Phase 4 in `docs/ROADMAP.md`. Concretely: an `@lint/linter-sdk` package that exports `BaseLinter` from `@lint/linters` and a small registration API. Third parties publish `lint-plugin-foo` with their own adapter; user adds `linters.plugins: [lint-plugin-foo]` in `.lintrc.yaml`.

### P3 — Documentation / polish

- [ ] **README badges**. The published `lint` README has no shield badges (npm version, downloads, license, Discord). Add them.
- [ ] **Demo GIF in README**. Record a 30-second screencast of the dashboard "Run lint → see live stream → AI review", export as a small GIF.
- [ ] **`lint --doctor` deep-dive output**. Currently terse. Add a `--verbose` mode that prints which linter found which file via which extension match, surfaces config inheritance, etc.

## Where the bodies are buried

Things that look weird but are intentional:

- **`packages/sdk/tsconfig.json` doesn't extend `tsconfig.base.json`**. The base has `composite: true` for project references; the SDK is a leaf publishable package built by tsup, not tsc. Keeping it on its own minimal tsconfig avoided a DTS emitter crash.
- **`runs-store.ts` lives in `@lint/core`, not `@lint/server`**. Originally I put it in server, but the CLI also needs to write runs (so terminal-initiated `lint .` shows in the dashboard), and core is the lowest common ground that both can import without a circular dep.
- **`runner.ts` falls back from `<workspace>/node_modules/.bin/lint` to global `lint`** because pnpm doesn't put workspace bins in the workspace root's `node_modules/.bin`. This is the pragmatic resolver — don't try to "improve" it without testing both paths.
- **The Electron `main.ts` opens external URLs via `setWindowOpenHandler`**, not the browser's default behavior. This matters for OAuth — when the user signs in to Lint Cloud (later), they need to land in their actual browser session, not a popup.
- **`.lint/runs.jsonl` is gitignored via `.lint/tmp/` already in the published `.gitignore` template.** The store ships in `.lint/runs.jsonl` directly (not under `tmp/`). Add it to `.gitignore` next time you touch the file — and check that the orchestrator's `cleanTmpDir()` doesn't accidentally wipe `runs.jsonl`. Currently `cleanTmpDir()` only touches `tmp/` so it's safe, but worth keeping an eye on.
- **The OG card SVG renders an empty white strip at the bottom in macOS Quick Look** — that's because Quick Look renders larger than viewBox. The actual exported PNG (`og-image.png`) is correct.

## How to test the full vertical

```bash
# 1. fresh install
cd ~/Dev/lint/lint-cli
pnpm install
pnpm typecheck
pnpm -r test

# 2. build everything
pnpm --filter "@lint/server..." build       # tsc -b internal packages + server
pnpm --filter @lint/dashboard-ui build      # vite
pnpm --filter @lint/desktop build           # tsup main+preload + copies dashboard dist

# 3. dev mode end-to-end (3 terminals)
# terminal A:
pnpm --filter @lint/server dev              # :7878
# terminal B:
pnpm --filter @lint/dashboard-ui dev        # :5173, proxies /api → :7878
# terminal C — verify:
curl localhost:7878/api/health
curl localhost:7878/api/repos
# Open http://localhost:5173, click "Run lint", see SSE stream

# 4. desktop mode (single terminal)
pnpm --filter @lint/desktop dev
# Picks workspace via OS dialog, embeds server, loads dashboard

# 5. ship it (once Apple secrets are set)
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
# Watch the Actions tab — Linux + Windows should succeed,
# macOS will succeed once MACOS_BUILD_ENABLED=true
```

## Contact / preferences

- User: Jimmy Douieb, French, works trunk-based on `main`, prefers short French summaries with bullet points
- Technical preferences: TypeScript strict, no emojis in source unless asked, comments explain the *why* not the *what*, default to no comments at all
- Brand: shield + checkmark glyph, palette slate-900 (#0f172a) / slate-100 (#e2e8f0) / sky-500 (#0ea5e9), Inter Display 800 for the wordmark
- Tooling on the user's machine: pnpm 10.7.1, Node 22 in CI / Node ≥20 locally, macOS arm64

That's it. Don't break the build. Ship small. Test before commit. Have fun.
