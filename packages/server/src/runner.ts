import { spawn } from "node:child_process";
import path from "node:path";
import type { ServerProject } from "./project-context.js";
import { emitRunEvent } from "./run-events.js";

// Spawn the `lint` CLI, parse its JSON report, and emit live stdout/
// stderr/exit events to subscribers via run-events.ts. SSE clients on
// /api/runs/:id/stream forward those to the dashboard in real time.

export interface LintInvocation {
  runId: string;
  workspace: ServerProject;
  paths?: string[];
  fix?: boolean;
}

export interface LintRunResult {
  exitCode: number;
  errorCount: number;
  warningCount: number;
  status: "passed" | "failed";
  rawJson?: unknown;
  errorMessage?: string;
}

// CLI lookup order:
//   1. <workspace>/node_modules/.bin/lint   (project-pinned version)
//   2. `lint` on PATH                       (npm i -g lint or pnpm link)
function resolveLintCommand(workspaceRoot: string): { cmd: string } {
  return { cmd: path.join(workspaceRoot, "node_modules", ".bin", "lint") };
}

export function spawnLintRun(invocation: LintInvocation): Promise<LintRunResult> {
  const { runId, workspace, paths = ["."], fix = false } = invocation;
  return new Promise((resolve) => {
    const args = ["--format", "json", ...(fix ? ["--fix"] : []), ...paths];
    const localBin = resolveLintCommand(workspace.root).cmd;

    let child = trySpawn(localBin, args, workspace.root);
    let fellBack = false;

    function trySpawn(cmd: string, a: string[], cwd: string) {
      try {
        return spawn(cmd, a, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        return null;
      }
    }

    function attach(c: NonNullable<ReturnType<typeof trySpawn>>) {
      let stdout = "";
      let stderr = "";

      c.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        emitRunEvent(runId, { type: "stdout", data: text });
      });
      c.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        emitRunEvent(runId, { type: "stderr", data: text });
      });

      c.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT" && !fellBack) {
          fellBack = true;
          const fallback = trySpawn("lint", args, workspace.root);
          if (!fallback) {
            const message = `lint not found on PATH and no local bin: ${err.message}`;
            emitRunEvent(runId, { type: "stderr", data: message });
            emitRunEvent(runId, { type: "exit", code: -1, status: "failed" });
            resolve(failure(message));
            return;
          }
          attach(fallback);
        } else {
          emitRunEvent(runId, { type: "stderr", data: err.message });
          emitRunEvent(runId, { type: "exit", code: -1, status: "failed" });
          resolve(failure(err.message));
        }
      });

      c.on("close", (code: number | null) => {
        if (fellBack && c === child) return; // first child died, fallback took over
        finalize(code, stdout, stderr);
      });
    }

    function finalize(exitCode: number | null, stdout: string, stderr: string) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = undefined;
      }
      const summary =
        parsed && typeof parsed === "object" && "summary" in parsed
          ? (parsed as { summary?: { errors?: number; warnings?: number } }).summary
          : undefined;
      const status: "passed" | "failed" = (exitCode ?? 1) === 0 ? "passed" : "failed";
      emitRunEvent(runId, { type: "exit", code: exitCode ?? -1, status });
      resolve({
        exitCode: exitCode ?? -1,
        errorCount: summary?.errors ?? 0,
        warningCount: summary?.warnings ?? 0,
        status,
        rawJson: parsed,
        errorMessage: stderr || undefined,
      });
    }

    function failure(message: string): LintRunResult {
      return {
        exitCode: -1,
        errorCount: 0,
        warningCount: 0,
        status: "failed",
        errorMessage: message,
      };
    }

    if (!child) {
      // Local bin spawn failed synchronously — try global lint immediately.
      fellBack = true;
      const fallback = trySpawn("lint", args, workspace.root);
      if (!fallback) {
        const msg = "could not locate lint CLI — is the `lint` package installed?";
        emitRunEvent(runId, { type: "stderr", data: msg });
        emitRunEvent(runId, { type: "exit", code: -1, status: "failed" });
        resolve(failure(msg));
        return;
      }
      child = fallback;
    }
    attach(child);
  });
}
