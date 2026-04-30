import { Hono } from "hono";
import type { ServerProject } from "../project-context.js";
import { createRunsStore, type Run } from "../runs-store.js";

export function runsRouter(workspace: ServerProject): Hono {
  const app = new Hono();
  const store = createRunsStore(workspace);

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
    return c.json(run, 201);
  });

  // PATCH a run — used by the orchestrator to mark a run completed and
  // attach final counts. Body is a partial Run minus id.
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
