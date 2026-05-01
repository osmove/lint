import { Hono } from "hono";
import { aiRouter } from "./routes/ai.js";
import { healthRouter } from "./routes/health.js";
import { lintersRouter } from "./routes/linters.js";
import { policiesRouter } from "./routes/policies.js";
import { projectsRouter } from "./routes/projects.js";
import { reposRouter } from "./routes/repos.js";
import { runsRouter } from "./routes/runs.js";
import type { ServerProject } from "./project-context.js";
import { mountStatic } from "./static.js";

export const VERSION = "0.1.0";

export interface BuildAppOptions {
  workspace: ServerProject;
  uiDistDir?: string;
}

export interface AppHandles {
  app: Hono;
  buses: { stopAll: () => void };
}

export function buildApp(options: BuildAppOptions): AppHandles {
  const { workspace, uiDistDir } = options;
  const app = new Hono();

  app.route("/api/health", healthRouter(workspace));
  app.route("/api/runs", runsRouter(workspace));
  app.route("/api/policies", policiesRouter(workspace));
  app.route("/api/projects", projectsRouter(workspace));
  app.route("/api/repos", reposRouter(workspace));
  app.route("/api/linters", lintersRouter(workspace));
  app.route("/api/ai", aiRouter(workspace));

  if (uiDistDir) {
    mountStatic(app, uiDistDir);
  }

  return {
    app,
    buses: {
      stopAll: () => {
        // No long-lived buses yet — placeholder for future SSE/event channels.
      },
    },
  };
}
