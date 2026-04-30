# @lint/server

Local Hono server that exposes the Lint workspace through REST and SSE, and serves the dashboard UI bundle (`@lint/dashboard-ui`).

Workspace-internal package — bundled by `@lint/desktop` (Electron) and reusable from any embedder.

## Run

```bash
pnpm --filter @lint/server dev
# → http://127.0.0.1:7878
curl localhost:7878/api/health
```

## Routes

- `GET  /api/health`
- `GET  /api/runs`, `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/stream` (SSE)
- `GET  /api/policies`, `PUT /api/policies`
- `GET  /api/repos`, `GET /api/repos/:id/health`
- `GET  /api/linters`
- `POST /api/ai/{review,fix,explain}` *(stubs — return 501 until @lint/ai exposes a non-CLI API)*
