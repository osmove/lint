# Lint — Multi-target Roadmap

Lint is built around four swappable interfaces. Each one starts with the simplest local implementation, then grows toward remote and managed targets. Users compose freely.

## Architectural invariants

- **No vendor lock-in.** Anthropic, OpenAI, GitHub, Heroku are all swappable. Lint defines stable interfaces; vendors plug in.
- **Default mode stays fully local.** No account, no signup, no network — `lint .` works end-to-end without ever calling out.
- **Remote modes are opt-in per linter / repo / runtime / target.** You choose which layer goes remote and which stays on your machine.
- **One mental model across targets.** Whether linters run locally or in CI, Lint reports the same shape of run, file, offense.

## Phase 1 — Local foundation (current)

| Layer       | Implementation                                     |
|-------------|----------------------------------------------------|
| Linters     | ESLint, Prettier, Biome, Ruff, RuboCop, Stylelint, Pylint, oxlint, erb-lint, Brakeman |
| Runtime     | local CPU, parallel by language                    |
| Sources     | git working tree (staged or whole repo)            |
| Policies    | local `.lintrc.yaml`                               |
| AI          | Anthropic Claude (review / fix / commit / explain) |
| UI          | terminal (CLI) + Lint Desktop (Electron)           |

This phase is shipped. Everything below is roadmap.

## Phase 2 — Cloud-hosted policies

`lint auth login` connects a repo to api.lint.to. Policies live cloud-side and sync down on each run.

- Multi-repo organizations
- Per-team rule overrides
- Policy templates ("Rails strict", "TypeScript essential")
- Webhook ingest of CI runs for fleet dashboards

## Phase 3 — Remote linter runtimes

Right now linters run on the host. Phase 3 lets a linter execute in an ephemeral remote sandbox so a TypeScript repo doesn't need RuboCop installed locally just because one Ruby file is staged.

- Anthropic-managed sandboxes (when available)
- GitHub Codespaces
- Self-hosted Docker pods
- fly.io machines (ephemeral)

## Phase 4 — Custom linters via plugin SDK

`@lint/linter-sdk` — third-party packages that extend `BaseLinter`, declare their extensions, and ship via npm. Drop-in support for Vale, biome-vue-plugin, ESLint plugins not yet covered, etc.

## Phase 5 — AI executors

Today AI features call Anthropic's hosted API. Phase 5 lets the inference itself be local (Ollama / llama.cpp) or routed through a self-hosted proxy.

- Ollama
- vLLM
- Anthropic via Bedrock / Vertex
- Custom OpenAI-compatible endpoints

## Phase 6 — Deploy targets

`lint ci` already gates a CI build. Phase 6 expands the surface: Lint becomes the glue between commit-time gates, fleet dashboards, and policy promotion.

- GitHub Actions (canonical)
- GitLab CI
- CircleCI
- Buildkite
- Custom webhook surface for control planes
