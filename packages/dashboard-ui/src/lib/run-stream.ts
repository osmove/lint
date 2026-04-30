// Tiny EventSource wrapper for /api/runs/:id/stream. Yields lines of
// the (decoded) stdout / stderr stream and a final {status} when the
// run exits. Closes the connection on exit or unsubscribe.

export type StreamEvent =
  | { type: "stdout" | "stderr"; data: string }
  | { type: "exit"; code: number; status: "passed" | "failed" };

export function subscribeRunStream(
  runId: string,
  onEvent: (event: StreamEvent) => void,
): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream`);

  const onText = (type: "stdout" | "stderr") => (raw: MessageEvent<string>) => {
    try {
      onEvent({ type, data: JSON.parse(raw.data) });
    } catch {
      // ignore malformed payloads — the server JSON.stringify-s every event
    }
  };
  const onExit = (raw: MessageEvent<string>) => {
    try {
      const { code, status } = JSON.parse(raw.data);
      onEvent({ type: "exit", code, status });
    } catch {
      // ignore
    } finally {
      es.close();
    }
  };

  es.addEventListener("stdout", onText("stdout") as EventListener);
  es.addEventListener("stderr", onText("stderr") as EventListener);
  es.addEventListener("exit", onExit as EventListener);

  return () => es.close();
}
