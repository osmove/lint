import { Hono } from "hono";
import type { ServerProject } from "../project-context.js";

export function reposRouter(workspace: ServerProject): Hono {
  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      repos: [
        {
          id: workspace.name,
          name: workspace.name,
          root: workspace.root,
          health: "unknown",
        },
      ],
    }),
  );

  app.get("/:id/health", (c) => {
    if (c.req.param("id") !== workspace.name) {
      return c.json({ error: "not found" }, 404);
    }
    // Placeholder — wire to @lint/core's doctor when ready.
    return c.json({
      id: workspace.name,
      status: "unknown",
      lastRun: null,
    });
  });

  return app;
}
