import fs from "node:fs";
import { Hono } from "hono";
import { getApiKey, runExplain, runFix, runReview } from "@lint/ai";
import { getStagedDiff, getStagedFilePaths } from "@lint/core";
import { LintReportSchema } from "@lint/schemas";
import { z } from "zod";
import type { ServerProject } from "../project-context.js";

const ReviewBodySchema = z.object({
  diff: z.string().optional(),
  files: z.array(z.string()).optional(),
});

const FixBodySchema = z.object({
  diff: z.string().optional(),
  files: z.array(z.string()).optional(),
  fileContents: z.record(z.string()).optional(),
});

const ExplainBodySchema = z.object({
  reports: z.array(LintReportSchema),
});

function requireApiKey(): { ok: true } | { ok: false; status: 400; body: { error: string } } {
  if (!getApiKey()) {
    return {
      ok: false,
      status: 400,
      body: {
        error:
          "ANTHROPIC_API_KEY is not configured. Set the env var or run `lint ai setup` to store one in ~/.lint/ai-config.",
      },
    };
  }
  return { ok: true };
}

export function aiRouter(_workspace: ServerProject): Hono {
  const app = new Hono();

  // POST /api/ai/review
  // Body: { diff?, files? } — if omitted, falls back to git's staged set.
  app.post("/review", async (c) => {
    const guard = requireApiKey();
    if (!guard.ok) return c.json(guard.body, guard.status);

    const parsed = ReviewBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    }

    const diff = parsed.data.diff ?? getStagedDiff();
    const files = parsed.data.files ?? getStagedFilePaths();
    if (!diff || files.length === 0) {
      return c.json({ error: "nothing to review (no diff/files)" }, 400);
    }

    try {
      const result = await runReview({ diff, files });
      return c.json(result);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // POST /api/ai/fix
  // Body: { diff?, files?, fileContents? }
  app.post("/fix", async (c) => {
    const guard = requireApiKey();
    if (!guard.ok) return c.json(guard.body, guard.status);

    const parsed = FixBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    }

    const diff = parsed.data.diff ?? getStagedDiff();
    const files = parsed.data.files ?? getStagedFilePaths();
    if (!diff || files.length === 0) {
      return c.json({ error: "nothing to fix (no diff/files)" }, 400);
    }

    // If the caller didn't ship file contents, read them from disk (capped
    // at 10 files / 10KB each — same heuristic the CLI form uses).
    let fileContents = parsed.data.fileContents;
    if (!fileContents) {
      fileContents = {};
      for (const file of files.slice(0, 10)) {
        try {
          const body = fs.readFileSync(file, "utf-8");
          if (body.length < 10_000) fileContents[file] = body;
        } catch {
          // unreadable — skip
        }
      }
    }

    try {
      const result = await runFix({ diff, files, fileContents });
      return c.json(result);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // POST /api/ai/explain
  // Body: { reports: LintReport[] }
  app.post("/explain", async (c) => {
    const guard = requireApiKey();
    if (!guard.ok) return c.json(guard.body, guard.status);

    const parsed = ExplainBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    }

    try {
      const result = await runExplain({ reports: parsed.data.reports });
      return c.json(result);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  return app;
}
