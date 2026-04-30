import { Hono } from "hono";
import { detectProject, getAllSuggestedLinters } from "@lint/core";
import type { ServerProject } from "../project-context.js";

export function lintersRouter(workspace: ServerProject): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const project = detectProject(workspace.root);
    return c.json({
      detected: project,
      suggested: getAllSuggestedLinters(project),
    });
  });

  return app;
}
