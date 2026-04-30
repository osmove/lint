import fs from "node:fs";
import path from "node:path";

// Append-only JSON-Lines store under <repo>/.lint/runs.jsonl. Each line is
// a single Run. To "update" we just append a new copy with the same id —
// readers fold by id, last-write-wins. Trades some bytes for crash-safety
// (no rename-into-place needed) and zero deps (no SQLite).
//
// Both the @lint/server (POST /api/runs) and the CLI's own `lint` invocation
// write to this same file, so dashboard listings see runs from either path.

export interface Run {
  id: string;
  startedAt: string;
  finishedAt?: string;
  errorCount: number;
  warningCount: number;
  status: "running" | "passed" | "failed";
  paths?: string[];
  format?: "text" | "json";
  fix?: boolean;
}

export interface RunsStore {
  list(): Run[];
  get(id: string): Run | null;
  insert(run: Run): void;
  update(id: string, patch: Partial<Omit<Run, "id">>): Run | null;
}

function runsFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".lint", "runs.jsonl");
}

function readAllRuns(filePath: string): Run[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const byId = new Map<string, Run>();
  for (const line of lines) {
    try {
      const run = JSON.parse(line) as Run;
      byId.set(run.id, run);
    } catch {
      // Skip malformed lines — a single bad write must not kill reads.
    }
  }
  return [...byId.values()];
}

function appendRun(filePath: string, run: Run): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(run)}\n`, "utf-8");
}

export function createRunsStore(workspaceRoot: string): RunsStore {
  const filePath = runsFilePath(workspaceRoot);
  return {
    list(): Run[] {
      return readAllRuns(filePath).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    get(id: string): Run | null {
      return readAllRuns(filePath).find((r) => r.id === id) ?? null;
    },
    insert(run: Run): void {
      appendRun(filePath, run);
    },
    update(id, patch): Run | null {
      const existing = readAllRuns(filePath).find((r) => r.id === id);
      if (!existing) return null;
      const next: Run = { ...existing, ...patch, id };
      appendRun(filePath, next);
      return next;
    },
  };
}

export function newRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
