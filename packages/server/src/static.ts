import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Hono } from "hono";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

export function mountStatic(app: Hono, distDir: string): void {
  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    const requested = c.req.path === "/" ? "/index.html" : c.req.path;
    const filePath = path.join(distDir, requested);
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) throw new Error("not a file");
      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      return c.body(body, 200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    } catch {
      // SPA fallback to index.html so client-side routes resolve.
      try {
        const body = await readFile(path.join(distDir, "index.html"));
        return c.body(body, 200, { "Content-Type": "text/html; charset=utf-8" });
      } catch {
        return c.notFound();
      }
    }
  });
}
