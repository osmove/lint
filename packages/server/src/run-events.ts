import { EventEmitter } from "node:events";

// Process-wide event hub for in-flight runs. The runner emits events
// keyed by run id; the SSE handler on /api/runs/:id/stream subscribes
// and forwards them to the client. Cleared once a run completes.
//
// We don't persist these — only the final summary lands in
// .lint/runs.jsonl. Stdout chunks are ephemeral by design.

export type RunEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; code: number; status: "passed" | "failed" };

const emitter = new EventEmitter();
emitter.setMaxListeners(50); // many SSE subs across many runs

// Per-run replay buffer so a client connecting mid-run gets the chunks
// it missed. Capped to keep memory bounded; oldest events drop first.
const REPLAY_CAP = 200;
const replay = new Map<string, RunEvent[]>();

export function emitRunEvent(runId: string, event: RunEvent): void {
  const buf = replay.get(runId) ?? [];
  buf.push(event);
  if (buf.length > REPLAY_CAP) buf.shift();
  replay.set(runId, buf);
  emitter.emit(runId, event);
  // Free memory once the run is done. Late-joining clients miss it,
  // but the run's final status is already in the runs store.
  if (event.type === "exit") {
    setTimeout(() => replay.delete(runId), 60_000);
  }
}

export function subscribeRun(
  runId: string,
  listener: (event: RunEvent) => void,
): { replay: RunEvent[]; unsubscribe: () => void } {
  const past = replay.get(runId) ?? [];
  emitter.on(runId, listener);
  return {
    replay: past,
    unsubscribe: () => emitter.off(runId, listener),
  };
}
