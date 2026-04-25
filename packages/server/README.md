# `lint-server`

Self-hosted backend for the [Lint CLI](https://www.npmjs.com/package/lint).

> **Status: 0.1.0 (early).** Auth (signup/login/me/logout) and policies CRUD are functional with SQLite. Repositories, runs, and AI proxy endpoints are still being implemented.

## What this is

Lint runs locally as a CLI by default. When teams want to share policies, store run history server-side, or proxy AI calls through their own infrastructure, they need a backend. `lint-server` is that backend, **self-hosted**.

The hosted SaaS version lives at [lint.to](https://lint.to) and is the same surface area, run by Osmove. You can use either — same API contract.

## License

[BUSL-1.1](./LICENSE) — non-production use is free, self-hosted production use is permitted, hosted commercial competition with Lint requires a commercial license. The license auto-converts to **Apache-2.0 on 2030-04-25**.

## Quickstart (Docker — easiest)

```sh
docker run -d --name lint-server \
  -p 3001:3001 \
  -v lint-server-data:/data \
  ghcr.io/osmove/lint-server:latest

curl http://127.0.0.1:3001/health
```

Or via `docker compose` from a repo checkout:

```sh
cd packages/server
docker compose up -d
```

## Quickstart (dev mode, from source)

```sh
corepack enable
pnpm install
pnpm --filter lint-server dev
```

Then:

```sh
curl http://127.0.0.1:3001/health
```

## Quickstart (production, from source)

```sh
pnpm --filter lint-server build
PORT=3001 node packages/server/dist/index.js
```

## Point the `lint` CLI at your self-hosted server

The `lint` CLI talks to `https://api.lint.to` by default. Override with `LINT_API_URL`:

```sh
export LINT_API_URL=http://localhost:3001
lint auth signup
lint auth login
lint auth status
```

`lint-server` exposes both API surfaces on the same process so the CLI works without modification:

- **Native** (`/api/v1/auth/*`) — Bearer tokens via `Authorization` header
- **Rails-compat** (`/users.json`, `/users/sign_in.json`, `/:username.json`) — token via `?user_token=` query param, used by older `lint` versions and `lint-cloud`

## Endpoints

```
GET    /                                  health
GET    /health                            health (verbose)

POST   /api/v1/auth/signup                { email, password, username? } → { user, token, expires_at }
POST   /api/v1/auth/login                 { email, password }            → { user, token, expires_at }
POST   /api/v1/auth/logout                Bearer token                   → 204
GET    /api/v1/auth/me                    Bearer token                   → { user }

GET    /api/v1/policies                   list current user's policies
POST   /api/v1/policies                   { name, yaml }                 → { policy }
GET    /api/v1/policies/:id               → { policy }
PATCH  /api/v1/policies/:id               { name?, yaml? }               → { policy }
DELETE /api/v1/policies/:id               → 204

POST   /users.json                        Rails-compat signup
POST   /users/sign_in.json                Rails-compat login
GET    /:username.json                    Rails-compat user fetch
```

## Configuration

| Env | Default | Description |
|---|---|---|
| `PORT` | `3001` | listen port |
| `HOST` | `127.0.0.1` | listen host |
| `LINT_SERVER_DB_PATH` | `./data/lint-server.db` | SQLite file path |
| `LINT_SERVER_CORS_ORIGIN` | `*` | CORS allowed origin |
| `LOG_LEVEL` | `info` | Pino log level |

## Roadmap

- ✅ `/api/v1/auth/*` — auth (signup/login/me/logout)
- ✅ `/api/v1/policies/*` — policies CRUD
- ✅ Rails-compat aliases for the existing `lint` CLI
- 🚧 `/api/v1/repositories/*` — repos config
- 🚧 `/api/v1/runs/*` — run reports
- 🚧 `/api/v1/ai/proxy` — BYOK Anthropic proxy
- 🚧 Webhook receivers (GitHub, GitLab)

See [Backlog Roadmap](https://github.com/osmove/backlog/blob/main/docs/ROADMAP.md) for the broader open-core plan.
