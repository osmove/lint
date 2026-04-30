import { Hono } from "hono";
import { createRunsStore, type Run } from "@lint/core";
import type { ServerProject } from "../project-context.js";
import { spawnLintRun } from "../runner.js";

export function runsRouter(workspace: ServerProject): Hono {
  const app = new Hono();
  const store = createRunsStore(workspace.root);

  app.get("/", (c) => c.json({ runs: store.list() }));

  app.get("/:id", (c) => {
    const run = store.get(c.req.param("id"));
    if (!run) return c.json({ error: "not found" }, 404);
    return c.json(run);
  });

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<Run>;
    const run: Run = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date().toISOString(),
      errorCount: 0,
      warningCount: 0,
      status: "running",
      ...body,
    };
    store.insert(run);

    // Fire-and-forget spawn — return 201 immediately so the caller's UI
    // can show a "running" state, then patch the record when the lint
    // process finishes. Errors are captured in errorMessage rather than
    // thrown, so a failed spawn doesn't kill the server.
    spawnLintRun({
      workspace,
      paths: run.paths,
      fix: run.fix,
    })
      .then((result) => {
        store.update(run.id, {
          status: result.status,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
          finishedAt: new Date().toISOString(),
        });
      })
      .catch((error) => {
        store.update(run.id, {
          status: "failed",
          finishedAt: new Date().toISOString(),
        });
        console.error(`[runs] spawn failed for ${run.id}:`, error);
      });

    return c.json(run, 201);
  });

  // PATCH a run — used by external orchestrators (CLI, CI) to push
  // status/counts onto a run they own.
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Partial<Omit<Run, "id">>;
    const updated = store.update(id, body);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json(updated);
  });

  // SSE stream for a run. Heartbeat skeleton — when @lint/core gains an
  // event bus, this is where to forward run events.
  app.get("/:id/stream", (c) => {
    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(": stream open\n\n"));
          const interval = setInterval(() => {
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${Date.now()}\n\n`));
          }, 15_000);
          c.req.raw.signal.addEventListener("abort", () => {
            clearInterval(interval);
            controller.close();
          });
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  });

  return app;
}
