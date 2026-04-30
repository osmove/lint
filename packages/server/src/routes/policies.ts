import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { findRCFile, formatRC, loadRC, writeRC } from "@lint/config";
import type { ServerProject } from "../project-context.js";

export function policiesRouter(_workspace: ServerProject): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const rc = loadRC();
    const filePath = findRCFile();
    return c.json({
      filePath,
      rc,
      yaml: formatRC(rc),
    });
  });

  app.put("/", async (c) => {
    const body = await c.req.json();
    if (!body || typeof body !== "object") {
      return c.json({ error: "body must be an object" }, 400);
    }
    writeRC(body);
    return c.json({ ok: true });
  });

  return app;
}
