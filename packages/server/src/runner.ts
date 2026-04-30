import { spawn } from "node:child_process";
import path from "node:path";
import type { ServerProject } from "./project-context.js";

// Spawn the `lint` CLI and parse its JSON report. Capture stdout fully —
// the CLI is fast (millis to seconds) so streaming isn't worth the
// complexity yet. SSE in routes/runs.ts can layer on top later.

export interface LintInvocation {
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
//   1. `lint` on PATH (npm i -g lint, or shimmed by pnpm link)
//   2. <workspace root>/node_modules/.bin/lint
//   3. fall back to the workspace's own packages/cli/dist/index.js when
//      we're running from inside the lint monorepo itself (dev)
function resolveLintCommand(workspaceRoot: string): { cmd: string; args: string[] } | null {
  // Try local node_modules first — respects whatever the project has pinned.
  const localBin = path.join(workspaceRoot, "node_modules", ".bin", "lint");
  // Note: we can't synchronously test PATH availability here without
  // child_process.spawnSync; the spawn() call below will surface ENOENT
  // naturally if `lint` isn't installed. Order: local bin → global lint.
  // Either way the args list is the same.
  return { cmd: localBin, args: [] };
}

export function spawnLintRun(invocation: LintInvocation): Promise<LintRunResult> {
  const { workspace, paths = ["."], fix = false } = invocation;
  return new Promise((resolve) => {
    const resolved = resolveLintCommand(workspace.root);
    if (!resolved) {
      resolve({
        exitCode: -1,
        errorCount: 0,
        warningCount: 0,
        status: "failed",
        errorMessage: "could not locate lint CLI — is the `lint` package installed?",
      });
      return;
    }

    const args = ["--format", "json", ...(fix ? ["--fix"] : []), ...paths];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(resolved.cmd, [...resolved.args, ...args], {
        cwd: workspace.root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // Try the global `lint` as a fallback.
      try {
        child = spawn("lint", args, {
          cwd: workspace.root,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (fallbackError) {
        resolve({
          exitCode: -1,
          errorCount: 0,
          warningCount: 0,
          status: "failed",
          errorMessage: `failed to spawn lint: ${(fallbackError as Error).message}`,
        });
        return;
      }
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // ENOENT (no `lint` on local bin) — fall back to global.
    let fellBack = false;
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT" && !fellBack) {
        fellBack = true;
        const fallback = spawn("lint", args, {
          cwd: workspace.root,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        fallback.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        fallback.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        fallback.on("error", (err2: Error) =>
          resolve({
            exitCode: -1,
            errorCount: 0,
            warningCount: 0,
            status: "failed",
            errorMessage: `lint not found on PATH: ${err2.message}`,
          }),
        );
        fallback.on("close", (code: number | null) => finalize(code));
      } else {
        resolve({
          exitCode: -1,
          errorCount: 0,
          warningCount: 0,
          status: "failed",
          errorMessage: err.message,
        });
      }
    });
    child.on("close", (code: number | null) => {
      if (!fellBack) finalize(code);
    });

    function finalize(exitCode: number | null) {
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
      resolve({
        exitCode: exitCode ?? -1,
        errorCount: summary?.errors ?? 0,
        warningCount: summary?.warnings ?? 0,
        status: (exitCode ?? 1) === 0 ? "passed" : "failed",
        rawJson: parsed,
        errorMessage: stderr || undefined,
      });
    }
  });
}
