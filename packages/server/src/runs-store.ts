import fs from "node:fs";
import path from "node:path";
import type { ServerProject } from "./project-context.js";

// Append-only JSON-Lines store under <repo>/.lint/runs.jsonl. Each line
// is a single Run. To "update" a run we just append a new copy with the
// same id — readers fold by id, last-write-wins. Trades some bytes for
// crash-safety (no rename-into-place needed) and zero deps (no SQLite).

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

function runsFilePath(workspace: ServerProject): string {
  return path.join(workspace.root, ".lint", "runs.jsonl");
}

function readAllRuns(filePath: string): Run[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  // Fold by id — later writes overwrite earlier ones.
  const byId = new Map<string, Run>();
  for (const line of lines) {
    try {
      const run = JSON.parse(line) as Run;
      byId.set(run.id, run);
    } catch {
      // Skip malformed lines so a single bad write doesn't kill reads.
    }
  }
  return [...byId.values()];
}

function appendRun(filePath: string, run: Run): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(run)}\n`, "utf-8");
}

export function createRunsStore(workspace: ServerProject): RunsStore {
  const filePath = runsFilePath(workspace);

  return {
    list(): Run[] {
      return readAllRuns(filePath).sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      );
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
