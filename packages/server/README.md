# `@osmove/lint-server`

Self-hosted backend for the [Lint CLI](https://www.npmjs.com/package/lint).

> **Status: scaffold (0.1.0).** Boots, exposes `/health`, but the policies, repositories, runs, and AI proxy endpoints are still being implemented.

## What this is

Lint runs locally as a CLI by default. When teams want to share policies, store run history server-side, or proxy AI calls through their own infrastructure, they need a backend. `lint-server` is that backend, **self-hosted**.

The hosted SaaS version lives at [lint.to](https://lint.to) and is the same surface area, run by Osmove. You can use either — same API contract.

## License

[BUSL-1.1](./LICENSE) — non-production use is free, self-hosted production use is permitted, hosted commercial competition with Lint requires a commercial license. The license auto-converts to **Apache-2.0 on 2030-04-25**.

## Quickstart (dev mode)

```sh
corepack enable
pnpm install
pnpm --filter @osmove/lint-server dev
```

Then:

```sh
curl http://127.0.0.1:3001/health
```

## Quickstart (production)

```sh
pnpm --filter @osmove/lint-server build
PORT=3001 node packages/server/dist/index.js
```

## Roadmap

- `/api/v1/auth/*` — local auth (signup/login/me/logout)
- `/api/v1/policies/*` — policies CRUD
- `/api/v1/repositories/*` — repos config
- `/api/v1/runs/*` — run reports
- `/api/v1/ai/proxy` — BYOK Anthropic proxy
- Webhook receivers (GitHub, GitLab)

See [Lint Roadmap](https://github.com/osmove/lint) and the [Backlog Roadmap](https://github.com/osmove/backlog/blob/main/docs/ROADMAP.md) for the broader open-core plan.
