import path from "node:path";
import { Hono } from "hono";
import {
  createRunsStore,
  listProjects,
  registerProject,
  unregisterProject,
  type Run,
} from "@lint/core";
import type { ServerProject } from "../project-context.js";

interface RepoView {
  id: string;
  name: string;
  root: string;
  addedAt: string | null;
  ephemeral: boolean;
  health: "passed" | "failed" | "unknown";
  latestRun: Run | null;
  summary: { total: number; passed: number; failed: number; running: number };
}

function readHealth(root: string): {
  health: RepoView["health"];
  latestRun: Run | null;
  summary: RepoView["summary"];
} {
  try {
    const store = createRunsStore(root);
    const latestRun = store.latest();
    const summary = store.summary();
    const health: RepoView["health"] =
      latestRun?.status === "passed"
        ? "passed"
        : latestRun?.status === "failed"
          ? "failed"
          : "unknown";
    return { health, latestRun, summary };
  } catch {
    // Read errors (permissions, missing dir, etc.) — degrade gracefully.
    return {
      health: "unknown",
      latestRun: null,
      summary: { total: 0, passed: 0, failed: 0, running: 0 },
    };
  }
}

export function reposRouter(workspace: ServerProject): Hono {
  const app = new Hono();

  // GET /api/repos
  // Registry merged with the current workspace, each annotated with health
  // derived from <root>/.lint/runs.jsonl. This is what powers the
  // dashboard Repos tab's coloured cards.
  app.get("/", (c) => {
    const registered = listProjects();
    const ids = new Set(registered.map((p) => p.id));
    const out: RepoView[] = [];

    for (const p of registered) {
      out.push({
        id: p.id,
        name: p.name,
        root: p.root,
        addedAt: p.addedAt,
        ephemeral: false,
        ...readHealth(p.root),
      });
    }

    if (!ids.has(workspace.name)) {
      out.push({
        id: workspace.name,
        name: workspace.name,
        root: workspace.root,
        addedAt: null,
        ephemeral: true,
        ...readHealth(workspace.root),
      });
    }

    return c.json({ repos: out });
  });

  // POST /api/repos { path, name? } — register a path. Idempotent.
  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; name?: string };
    if (!body.path || typeof body.path !== "string") {
      return c.json({ error: "missing 'path' (string)" }, 400);
    }
    const entry = registerProject(body.path, body.name);
    return c.json(entry, 201);
  });

  // DELETE /api/repos/:id
  app.delete("/:id", (c) => {
    const removed = unregisterProject(c.req.param("id"));
    if (!removed) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // GET /api/repos/:id/health
  // Health detail for a single repo. Includes the last 10 runs so the
  // dashboard can render a sparkline / trend chart.
  app.get("/:id/health", (c) => {
    const id = c.req.param("id");
    const all = [
      ...listProjects(),
      { id: workspace.name, name: workspace.name, root: workspace.root, addedAt: null },
    ];
    const target = all.find((p) => p.id === id);
    if (!target) return c.json({ error: "not found" }, 404);

    const { health, latestRun, summary } = readHealth(target.root);
    let recentRuns: Run[] = [];
    try {
      recentRuns = createRunsStore(target.root).list().slice(0, 10);
    } catch {
      // ignore
    }

    return c.json({
      id: target.id,
      root: target.root,
      basename: path.basename(target.root),
      health,
      latestRun,
      summary,
      recentRuns,
    });
  });

  return app;
}
