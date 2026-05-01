# AGENTS.md

This repo is a **pnpm monorepo**. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before working in it.

## Layout (canonical)

- `packages/cli/` — `lint` (Apache-2.0, npm: [`lint`](https://www.npmjs.com/package/lint))
- `packages/sdk/` — `@osmove/lint-sdk` (Apache-2.0, npm public) — typed OpenAPI client for `api.lint.to`
- `packages/server/` — `@lint/server` — local Hono server, exposes the workspace via REST/SSE and serves the dashboard UI
- `packages/dashboard-ui/` — `@lint/dashboard-ui` — Svelte 5 dashboard (Runs / Policies / Repos)
- `packages/desktop/` — `@lint/desktop` — Electron wrapper, ships as DMG / AppImage / NSIS via GitHub Releases
- `packages/{schemas,config,git,hooks,linters,ai,policies,core}/` — workspace-internal modules, bundled into the CLI tarball at publish time
- `docs/ROADMAP.md` — multi-target roadmap
- Root `README.md` is symlinked from `packages/cli/README.md` (CLI README is the canonical one for npm)

## Package boundaries

- `packages/schemas/` (Zod) is the **source of truth for cross-boundary types**.
- Product vocabulary matches Backlog, Twoody, and Osmove: a **project** is the work container; a project can contain multiple git **repositories**. The user registry is `~/.lint/projects.json` (version 2).
- Internal packages use `workspace:*` deps; tsup bundles everything for the published `lint` tarball.
- The cloud backend (Lint Cloud — Rails) lives in the sister repo `lint-backend/` and is not part of this monorepo.

## Common commands

```sh
pnpm install                              # install workspace
pnpm test                                 # vitest run (workspace-wide)
pnpm typecheck                            # tsc -b (project references)
pnpm --filter lint dev                    # CLI dev mode (tsup --watch)
pnpm --filter lint build                  # CLI build (tsup, bundles all @lint/*)
pnpm --filter @lint/server dev            # local server on :7878
pnpm --filter @lint/dashboard-ui dev      # dashboard on :5173 (proxies /api)
pnpm --filter @lint/desktop dev           # Electron app (embeds server + UI)
pnpm --filter @lint/desktop dist:mac      # build signable DMG
```

## CLI conventions

- Default mode is fully local. Cloud sync (api.lint.to) is opt-in via `lint auth login`.
- Linter conflicts auto-resolve: Biome replaces ESLint+Prettier+oxlint; Ruff replaces Pylint.
- Version flag: `-v, --version`.
- AI features (`lint ai review/fix/commit/explain`) require `ANTHROPIC_API_KEY` or `lint ai setup`.

## License

`packages/cli/`, `packages/sdk/`, `packages/server/`, `packages/dashboard-ui/`, `packages/desktop/` ship under **Apache-2.0**. All workspace-internal packages (`schemas`, `config`, `git`, `hooks`, `linters`, `ai`, `policies`, `core`) are not published.

## Open core

- `osmove/lint` — this repo (CLI + SDK + Server + Desktop, Apache-2.0)
- Lint Cloud — managed hosted backend (Rails, `lint-backend/`), private repo, paid SaaS

See [docs/ROADMAP.md](./docs/ROADMAP.md) for the broader plan.
