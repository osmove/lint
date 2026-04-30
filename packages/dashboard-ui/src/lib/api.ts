// Typed client for /api routes. Uses @osmove/lint-sdk so the dashboard
// and any third-party integrator share the same generated types.
//
// In dev, vite proxies /api → http://127.0.0.1:7878 (see vite.config.ts).
// In production (Electron), the embedded Hono server serves both the
// SPA bundle and the API on the same origin — baseUrl: '' is enough.

import { createLintClient, type LintClient } from "@osmove/lint-sdk";

const client: LintClient = createLintClient({ baseUrl: "" });

async function unwrap<T>(p: Promise<{ data?: T; error?: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error || data === undefined) throw new Error(JSON.stringify(error ?? "no data"));
  return data;
}

export const api = {
  health: () => unwrap(client.GET("/api/health")),
  listRuns: () => unwrap(client.GET("/api/runs")),
  getRun: (id: string) => unwrap(client.GET("/api/runs/{id}", { params: { path: { id } } })),
  createRun: (body: { paths?: string[]; fix?: boolean; format?: "text" | "json" }) =>
    unwrap(client.POST("/api/runs", { body })),
  listRepos: () => unwrap(client.GET("/api/repos")),
  getPolicies: () => unwrap(client.GET("/api/policies")),
  getLinters: () => unwrap(client.GET("/api/linters")),
  aiReview: (body: { diff?: string; files?: string[] }) =>
    unwrap(client.POST("/api/ai/review", { body })),
  aiFix: (body: { diff?: string; files?: string[]; fileContents?: Record<string, string> }) =>
    unwrap(client.POST("/api/ai/fix", { body })),
};
