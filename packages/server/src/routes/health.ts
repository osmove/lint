import { Hono } from "hono";
import type { ServerProject } from "../project-context.js";

export function healthRouter(_workspace: ServerProject): Hono {
  const app = new Hono();
  app.get("/", (c) =>
    c.json({
      status: "ok",
      service: "lint-server",
      version: VERSION,
    }),
  );
  return app;
}

export const VERSION = "0.1.0";
