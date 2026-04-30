import { Hono } from "hono";
import { createRunsStore, newRunId, type Run } from "@lint/core";
import type { ServerProject } from "../project-context.js";
import { subscribeRun } from "../run-events.js";
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
      id: newRunId(),
      startedAt: new Date().toISOString(),
      errorCount: 0,
      warningCount: 0,
      status: "running",
      ...body,
    };
    store.insert(run);

    // Fire-and-forget spawn. The runner emits stdout/stderr/exit events
    // through run-events.ts so SSE subscribers see them live; we only
    // wait for the final result here to update the persistent record.
    spawnLintRun({
      runId: run.id,
      workspace,
      ...(run.paths ? { paths: run.paths } : {}),
      ...(run.fix ? { fix: run.fix } : {}),
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
  // status / counts onto a run they own.
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Partial<Omit<Run, "id">>;
    const updated = store.update(id, body);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json(updated);
  });

  // SSE stream for a run. Forwards stdout/stderr/exit events from the
  // runner. Late joiners get the buffered replay first, then live events.
  app.get("/:id/stream", (c) => {
    const runId = c.req.param("id");
    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const send = (event: string, payload: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
            );
          };

          controller.enqueue(encoder.encode(": stream open\n\n"));

          const sub = subscribeRun(runId, (ev) => {
            if (ev.type === "stdout" || ev.type === "stderr") {
              send(ev.type, ev.data);
            } else {
              send("exit", { code: ev.code, status: ev.status });
            }
          });

          // Replay buffered events for late joiners.
          for (const ev of sub.replay) {
            if (ev.type === "stdout" || ev.type === "stderr") send(ev.type, ev.data);
            else send("exit", { code: ev.code, status: ev.status });
          }

          // Heartbeat every 15s so proxies don't drop the connection.
          const interval = setInterval(() => {
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${Date.now()}\n\n`));
          }, 15_000);

          c.req.raw.signal.addEventListener("abort", () => {
            clearInterval(interval);
            sub.unsubscribe();
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
