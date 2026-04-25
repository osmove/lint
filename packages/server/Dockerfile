FROM node:22-slim AS build

# Build the workspace bundle. We treat the monorepo root as the build context
# so pnpm can resolve `workspace:*` deps and tsup can bundle them.
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/server/package.json ./packages/server/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Re-run install once code is present so native bindings (better-sqlite3) build.
COPY packages/server ./packages/server
RUN pnpm install --frozen-lockfile && \
    pnpm --filter lint-server build

# ── runtime image ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the built bundle and the runtime node_modules tree (better-sqlite3 has
# a native binding, can't be tree-shaken into the bundle).
COPY --from=build /workspace/packages/server/dist ./dist
COPY --from=build /workspace/packages/server/package.json ./package.json
COPY --from=build /workspace/packages/server/node_modules ./node_modules

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV LINT_SERVER_DB_PATH=/data/lint-server.db

VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
