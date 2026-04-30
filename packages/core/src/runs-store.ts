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

export interface RunsStore {
  list(): Run[];
  get(id: string): Run | null;
  /** Newest run with status passed | failed (excludes still-running entries). */
  latest(): Run | null;
  /** Aggregate counts for the dashboard's per-repo health card. */
  summary(): { total: number; passed: number; failed: number; running: number };
  insert(run: Run): void;
  update(id: string, patch: Partial<Omit<Run, "id">>): Run | null;
}

export function createRunsStore(workspaceRoot: string): RunsStore {
  const filePath = runsFilePath(workspaceRoot);
  const sorted = () =>
    readAllRuns(filePath).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return {
    list(): Run[] {
      return sorted();
    },
    get(id: string): Run | null {
      return readAllRuns(filePath).find((r) => r.id === id) ?? null;
    },
    latest(): Run | null {
      return sorted().find((r) => r.status !== "running") ?? null;
    },
    summary() {
      const all = readAllRuns(filePath);
      const out = { total: all.length, passed: 0, failed: 0, running: 0 };
      for (const r of all) {
        if (r.status === "passed") out.passed++;
        else if (r.status === "failed") out.failed++;
        else if (r.status === "running") out.running++;
      }
      return out;
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
