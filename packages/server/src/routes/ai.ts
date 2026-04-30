import { Hono } from "hono";
import type { ServerProject } from "../project-context.js";

export function aiRouter(_workspace: ServerProject): Hono {
  const app = new Hono();

  // Placeholder endpoints. The real implementations stream tokens from
  // @lint/ai's chat() helper — wire them once @lint/ai exposes a non-CLI
  // API (currently it prints to stdout).
  app.post("/review", (c) =>
    c.json({ error: "not implemented yet — use `lint ai review` for now" }, 501),
  );
  app.post("/fix", (c) =>
    c.json({ error: "not implemented yet — use `lint ai fix` for now" }, 501),
  );
  app.post("/explain", (c) =>
    c.json({ error: "not implemented yet — use `lint ai explain` for now" }, 501),
  );

  return app;
}
