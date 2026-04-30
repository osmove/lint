# @lint/dashboard-ui

Svelte 5 dashboard for the local Lint server. Three tabs:

- **Runs** — recent lint executions, errors grouped by file/rule, AI explain/fix sidebar.
- **Policies** — `.lintrc.yaml` editor + cloud sync.
- **Repos** — multi-repo health overview.

## Dev

```bash
pnpm --filter @lint/server dev      # tab 1: backend on :7878
pnpm --filter @lint/dashboard-ui dev # tab 2: frontend on :5173 (proxies /api)
```

## Build

```bash
pnpm --filter @lint/dashboard-ui build  # → dist/
```

The bundle is consumed by `@lint/server` (mounted as static) and by `@lint/desktop` (copied into the Electron asar at build time).
