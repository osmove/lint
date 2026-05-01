import path from "node:path";
import { Hono } from "hono";
import {
  createRunsStore,
  listRepositories,
  registerProject,
  unregisterProject,
  type Run,
} from "@lint/core";
import type { ServerProject } from "../project-context.js";

interface RepoView {
  id: string;
  name: string;
  root: string;
  projectId: string;
  projectName: string;
  addedAt: string | null;
  ephemeral: boolean;
  health: "passed" | "failed" | "unknown";
  latestRun: Run | null;
  summary: { total: number; passed: number; failed: number; running: number };
}

export function readRepoHealth(root: string): {
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
    const registered = listRepositories();
    const roots = new Set(registered.map((p) => path.resolve(p.root)));
    const out: RepoView[] = [];

    for (const repo of registered) {
      out.push({
        id: repo.id,
        name: repo.name,
        root: repo.root,
        projectId: repo.projectId,
        projectName: repo.projectName,
        addedAt: repo.addedAt,
        ephemeral: false,
        ...readRepoHealth(repo.root),
      });
    }

    if (!roots.has(path.resolve(workspace.root))) {
      out.push({
        id: workspace.name,
        name: workspace.name,
        root: workspace.root,
        projectId: workspace.name,
        projectName: workspace.name,
        addedAt: null,
        ephemeral: true,
        ...readRepoHealth(workspace.root),
      });
    }

    return c.json({ repos: out });
  });

  // POST /api/repos { path, name? } — register a path as a one-repo project.
  // Prefer /api/projects/:id/repos when attaching a repo to an existing
  // project; this route stays for the CLI/desktop compatibility path.
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
      ...listRepositories(),
      {
        id: workspace.name,
        name: workspace.name,
        root: workspace.root,
        projectId: workspace.name,
        projectName: workspace.name,
        addedAt: null,
      },
    ];
    const target = all.find((p) => p.id === id);
    if (!target) return c.json({ error: "not found" }, 404);

    const { health, latestRun, summary } = readRepoHealth(target.root);
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
