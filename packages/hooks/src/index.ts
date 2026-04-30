import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { ensureDir, findGitDir, findGitRoot } from "@lint/git";

export const MANAGED_HOOK_MARKER = "Managed by Lint";

export interface HookInspection {
  name: string;
  hookPath: string;
  exists: boolean;
  managed: boolean;
}

function hookContent(
  lintInvocation: string,
  npxInvocation: string,
  timeout: number,
  skipEnv: string,
): string {
  return `#!/bin/sh
# ${MANAGED_HOOK_MARKER}. Reinstall through:
#   lint hooks install
# Skip: ${skipEnv}=1 git commit ...
# Skip: git commit --no-verify

set -eu

[ "$${skipEnv}" = "1" ] && exit 0

run_with_timeout() {
  TIMEOUT_SECONDS="$1"
  shift
  TIMEOUT_FLAG="\${TMPDIR:-/tmp}/lint-hook-timeout.$$"
  rm -f "$TIMEOUT_FLAG"

  "$@" &
  CMD_PID=$!

  (
    sleep "$TIMEOUT_SECONDS"
    if kill -0 "$CMD_PID" 2>/dev/null; then
      : > "$TIMEOUT_FLAG"
      kill "$CMD_PID" 2>/dev/null || true
    fi
  ) &
  WATCHER_PID=$!

  wait "$CMD_PID" || STATUS=$?
  STATUS=\${STATUS:-0}
  kill "$WATCHER_PID" 2>/dev/null || true
  wait "$WATCHER_PID" 2>/dev/null || true

  if [ -f "$TIMEOUT_FLAG" ]; then
    rm -f "$TIMEOUT_FLAG"
    echo "Lint: hook timed out after ${timeout}s." >&2
    return 124
  fi

  rm -f "$TIMEOUT_FLAG"
  return "$STATUS"
}

if command -v lint >/dev/null 2>&1; then
  ${lintInvocation}
elif command -v npx >/dev/null 2>&1; then
  ${npxInvocation}
else
  echo "Lint: lint command not found. Skipping hook."
  exit 0
fi
`;
}

function inspectHook(hooksDir: string, name: string): HookInspection {
  const hookPath = path.join(hooksDir, name);
  if (!fs.existsSync(hookPath)) {
    return { name, hookPath, exists: false, managed: false };
  }
  const content = fs.readFileSync(hookPath, "utf-8");
  return {
    name,
    hookPath,
    exists: true,
    managed: content.includes(MANAGED_HOOK_MARKER),
  };
}

export function inspectManagedHook(gitRoot: string, name: string): HookInspection | null {
  const gitDir = findGitDir(gitRoot);
  if (!gitDir) return null;
  return inspectHook(path.join(gitDir, "hooks"), name);
}

export function inspectManagedHooks(gitRoot: string): HookInspection[] {
  const gitDir = findGitDir(gitRoot);
  if (!gitDir) return [];
  return ["pre-commit", "prepare-commit-msg", "post-commit"].map((name) =>
    inspectHook(path.join(gitDir, "hooks"), name),
  );
}

export function installHooks(options?: { timeout?: number; skipEnv?: string }): void {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("Not inside a git repository."));
    return;
  }

  const timeout = options?.timeout ?? 60;
  const skipEnv = options?.skipEnv ?? "LINT_SKIP";
  const gitDir = findGitDir(gitRoot);
  if (!gitDir) {
    console.log(chalk.red("Unable to locate .git directory."));
    return;
  }

  const hasHusky = fs.existsSync(path.join(gitRoot, ".husky"));
  const hasLefthook =
    fs.existsSync(path.join(gitRoot, "lefthook.yml")) ||
    fs.existsSync(path.join(gitRoot, ".lefthook.yml"));

  if (hasHusky) {
    console.log(chalk.yellow("  Husky detected. Adding Lint as a Husky hook."));
    const huskyDir = path.join(gitRoot, ".husky");
    const hookPath = path.join(huskyDir, "pre-commit");
    const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, "utf-8") : "";
    if (!existing.includes("lint")) {
      const content = `${existing.trimEnd()}\nlint pre-commit\n`;
      fs.writeFileSync(hookPath, content, { mode: 0o755 });
      console.log(chalk.green("  ✓ Added to .husky/pre-commit"));
    } else {
      console.log(chalk.gray("  Already in .husky/pre-commit"));
    }
    return;
  }

  if (hasLefthook) {
    console.log(chalk.yellow("  Lefthook detected. Add Lint manually to lefthook.yml:"));
    console.log(
      chalk.gray("    pre-commit:\n      commands:\n        lint:\n          run: lint pre-commit"),
    );
    return;
  }

  const hooksDir = path.join(gitDir, "hooks");
  ensureDir(hooksDir);

  const hooks: Record<string, string> = {
    "pre-commit": hookContent(
      `run_with_timeout "${timeout}" lint pre-commit -t "$@"`,
      `run_with_timeout "${timeout}" npx --no-install lint pre-commit -t "$@"`,
      timeout,
      skipEnv,
    ),
    "prepare-commit-msg": hookContent(
      `run_with_timeout "${timeout}" lint prepare-commit-msg "$@"`,
      `run_with_timeout "${timeout}" npx --no-install lint prepare-commit-msg "$@"`,
      timeout,
      skipEnv,
    ),
    "post-commit": hookContent(
      `run_with_timeout "${timeout}" lint post-commit "$@"`,
      `run_with_timeout "${timeout}" npx --no-install lint post-commit "$@"`,
      timeout,
      skipEnv,
    ),
  };

  for (const [name, content] of Object.entries(hooks)) {
    const hookPath = path.join(hooksDir, name);
    const inspection = inspectHook(hooksDir, name);
    if (inspection.exists && !inspection.managed) {
      const backupDir = path.join(hooksDir, `backup_${Date.now()}`);
      ensureDir(backupDir);
      fs.copyFileSync(hookPath, path.join(backupDir, name));
    }
    fs.writeFileSync(hookPath, content, { mode: 0o755 });
    console.log(chalk.green(`  ✓ ${name}`));
  }

  console.log(chalk.green("\nGit hooks installed."));
  console.log(chalk.gray(`  Timeout: ${timeout}s | Skip: ${skipEnv}=1 git commit ...`));
}

export function uninstallHooks(): void {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("Not inside a git repository."));
    return;
  }
  const gitDir = findGitDir(gitRoot);
  if (!gitDir) {
    console.log(chalk.red("Unable to locate .git directory."));
    return;
  }

  const hooksDir = path.join(gitDir, "hooks");
  for (const name of ["pre-commit", "prepare-commit-msg", "post-commit"]) {
    const inspection = inspectHook(hooksDir, name);
    if (inspection.exists && inspection.managed) {
      fs.unlinkSync(inspection.hookPath);
      console.log(chalk.yellow(`  ✗ ${name} removed`));
    }
  }

  console.log("Git hooks uninstalled.");
}
