import { Hono } from "hono";
import type { ServerProject } from "../project-context.js";

interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt?: string;
  errorCount: number;
  warningCount: number;
  status: "running" | "passed" | "failed";
}

const inMemoryRuns: RunSummary[] = [];

export function runsRouter(_workspace: ServerProject): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json({ runs: inMemoryRuns }));

  app.get("/:id", (c) => {
    const run = inMemoryRuns.find((r) => r.id === c.req.param("id"));
    if (!run) return c.json({ error: "not found" }, 404);
    return c.json(run);
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = `run-${Date.now()}`;
    const summary: RunSummary = {
      id,
      startedAt: new Date().toISOString(),
      errorCount: 0,
      warningCount: 0,
      status: "running",
      ...body,
    };
    inMemoryRuns.unshift(summary);
    return c.json(summary, 201);
  });

  // Server-Sent Events for live run updates. Right now this is a heartbeat
  // skeleton — wire it to @lint/core's run engine once that exposes events.
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
