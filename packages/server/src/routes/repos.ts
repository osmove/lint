import path from "node:path";
import { Hono } from "hono";
import { listProjects, registerProject, unregisterProject } from "@lint/core";
import type { ServerProject } from "../project-context.js";

export function reposRouter(workspace: ServerProject): Hono {
  const app = new Hono();

  // GET /api/repos
  // Returns the user-level registry (~/.lint/projects.json) merged with
  // the current workspace, so the dashboard always sees at least one
  // entry — the repo the server was started against — even if the user
  // has never run `lint repos add`.
  app.get("/", (c) => {
    const registered = listProjects();
    const ids = new Set(registered.map((p) => p.id));
    const workspaceEntry = ids.has(workspace.name)
      ? null
      : {
          id: workspace.name,
          name: workspace.name,
          root: workspace.root,
          addedAt: null,
          ephemeral: true as const,
        };
    return c.json({
      repos: [
        ...registered.map((p) => ({ ...p, ephemeral: false as const })),
        ...(workspaceEntry ? [workspaceEntry] : []),
      ],
    });
  });

  // POST /api/repos { path: string, name?: string }
  // Register a path. Idempotent — re-registering the same root returns
  // the existing entry.
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

  app.get("/:id/health", (c) => {
    const id = c.req.param("id");
    const all = [
      ...listProjects(),
      { id: workspace.name, name: workspace.name, root: workspace.root, addedAt: null },
    ];
    const target = all.find((p) => p.id === id);
    if (!target) return c.json({ error: "not found" }, 404);
    return c.json({
      id: target.id,
      root: target.root,
      // Health placeholder — wire to runs-store summary once we have
      // a "latest run per repo" index.
      status: "unknown",
      lastRun: null,
      basename: path.basename(target.root),
    });
  });

  return app;
}
