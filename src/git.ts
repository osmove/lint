import fs from "node:fs";
import path from "node:path";
import { checkbox, confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import * as api from "./api.js";
import { getToken, getUsername, isLoggedIn } from "./auth.js";
import {
  checkLinterInstallation,
  detectProject,
  getAllSuggestedLinters,
  printDetectionSummary,
} from "./detect.js";
import { generateDefaultRC, writeRC } from "./rc.js";
import type { LintConfig, LinterName, StagedFile } from "./types.js";
import { ensureDir, exec, execGit, findGitDir, findGitRoot, readLintConfig, writeLintConfig } from "./utils.js";

export const MANAGED_HOOK_MARKER = "Managed by Lint";

export interface HookInspection {
  hookPath: string;
  exists: boolean;
  managed: boolean;
}

// ── Staged files ──

export function getStagedFiles(): StagedFile[] {
  try {
    const output = execGit(["diff", "--cached", "--name-status", "-z", "--diff-filter=AMDR"], undefined, {
      silent: true,
    });
    if (!output) return [];

    const entries = output.split("\0").filter(Boolean);
    const files: StagedFile[] = [];

    for (let i = 0; i < entries.length; ) {
      const statusCode = entries[i++] || "";
      let status: StagedFile["status"];
      let filePath: string;

      if (statusCode.startsWith("A")) {
        status = "added";
        filePath = entries[i++] || "";
      } else if (statusCode.startsWith("D")) {
        status = "deleted";
        filePath = entries[i++] || "";
      } else if (statusCode.startsWith("R")) {
        status = "renamed";
        i += 1; // old path
        filePath = entries[i++] || "";
      } else {
        status = "modified";
        filePath = entries[i++] || "";
      }

      if (filePath) {
        files.push({ path: filePath, status });
      }
    }

    return files;
  } catch {
    return [];
  }
}

export function getStagedFilePaths(excludeDeleted = true): string[] {
  const files = getStagedFiles();
  if (excludeDeleted) {
    return files.filter((f) => f.status !== "deleted").map((f) => f.path);
  }
  return files.map((f) => f.path);
}

export function getCurrentSha(): string {
  try {
    return execGit(["rev-parse", "HEAD"], undefined, { silent: true });
  } catch {
    return "unknown";
  }
}

export function getCurrentBranch(): string {
  try {
    return execGit(["rev-parse", "--abbrev-ref", "HEAD"], undefined, { silent: true });
  } catch {
    return "unknown";
  }
}

export function getStagedDiff(): string {
  try {
    return execGit(["diff", "--cached"], undefined, { silent: true });
  } catch {
    return "";
  }
}

// ── Find files by glob (for `lint .` and `lint src/`) ──

export function findFiles(targetPath: string): string[] {
  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    return [];
  }

  // Single file
  if (fs.statSync(resolved).isFile()) {
    return [resolved];
  }

  // Directory — walk recursively
  const files: string[] = [];
  const ignoreDirs = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".lint",
    "__pycache__",
  ]);

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name) && !entry.name.startsWith(".")) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        files.push(path.join(dir, entry.name));
      }
    }
  }

  walk(resolved);
  return files;
}

// ── Git hooks ──

function hookContent(
  lintInvocation: string,
  npxInvocation: string,
  timeout: number,
  skipEnv: string,
): string {
  return `#!/bin/sh
# ${MANAGED_HOOK_MARKER}. Reinstall through:
#   lint install:hooks
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
    return { hookPath, exists: false, managed: false };
  }

  const content = fs.readFileSync(hookPath, "utf-8");
  return {
    hookPath,
    exists: true,
    managed: content.includes(MANAGED_HOOK_MARKER),
  };
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

  // Detect existing hook managers
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

    // Backup existing non-Lint hook
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
  const hookNames = ["pre-commit", "prepare-commit-msg", "post-commit"];

  for (const name of hookNames) {
    const inspection = inspectHook(hooksDir, name);
    if (inspection.exists && inspection.managed) {
      fs.unlinkSync(inspection.hookPath);
      console.log(chalk.yellow(`  ✗ ${name} removed`));
    }
  }

  console.log("Git hooks uninstalled.");
}

// ── Smart Repository Initialization ──

export async function init(): Promise<void> {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("Not inside a git repository. Run 'git init' first."));
    return;
  }

  const repoName = path.basename(gitRoot);

  console.log(chalk.cyan.bold("\n  Lint Setup\n"));

  // Check existing config
  const existing = readLintConfig();
  if (existing?.uuid) {
    console.log(chalk.yellow(`Already initialized (${existing.uuid}).`));
    const reinit = await confirm({ message: "Re-initialize?" });
    if (!reinit) return;
  }

  // ── Step 1: Detect project ──
  console.log(chalk.bold("Scanning project...\n"));
  const project = detectProject(gitRoot);
  printDetectionSummary(project);
  console.log("");

  // ── Step 2: Suggest and select linters ──
  const suggested = getAllSuggestedLinters(project);
  const installStatus = checkLinterInstallation(suggested);

  const linterChoices = installStatus.map((l) => ({
    name: `${l.name} ${l.installed ? chalk.green("(installed)") : chalk.red("(not installed)")}`,
    value: l.name,
    checked: true,
  }));

  let selectedLinters: LinterName[];
  if (linterChoices.length > 0) {
    selectedLinters = await checkbox({
      message: "Which linters should Lint use?",
      choices: linterChoices,
    });
  } else {
    console.log(chalk.yellow("No linters detected for this project."));
    selectedLinters = [];
  }

  // ── Step 3: Offer to install missing linters ──
  const missing = installStatus.filter((l) => !l.installed && selectedLinters.includes(l.name));
  if (missing.length > 0) {
    const installMissing = await confirm({
      message: `Install ${missing.length} missing linter(s)? (${missing.map((l) => l.name).join(", ")})`,
      default: true,
    });

    if (installMissing) {
      const INSTALL_COMMANDS: Record<string, string> = {
        biome: "npm install -g @biomejs/biome",
        eslint: "npm install -g eslint",
        prettier: "npm install -g prettier",
        oxlint: "npm install -g oxlint",
        stylelint: "npm install -g stylelint",
        ruff: "pip install ruff",
        pylint: "pip install pylint",
        rubocop: "gem install rubocop",
        erblint: "gem install erb_lint",
        brakeman: "gem install brakeman",
      };

      for (const l of missing) {
        const cmd = INSTALL_COMMANDS[l.name];
        if (cmd) {
          try {
            process.stdout.write(chalk.gray(`  Installing ${l.name}... `));
            exec(cmd, { silent: true });
            console.log(chalk.green("done"));
          } catch {
            console.log(chalk.red("failed"));
          }
        }
      }
      console.log("");
    }
  }

  // ── Step 4: Write .lintrc.yaml ──
  const rc = generateDefaultRC(selectedLinters);
  writeRC(rc);
  console.log(chalk.green("  ✓ Created .lintrc.yaml"));

  // ── Step 5: Install hooks ──
  const installHooksAnswer = await confirm({
    message: "Install git hooks? (auto-lint on commit)",
    default: true,
  });

  if (installHooksAnswer) {
    installHooks({
      timeout: rc.hooks?.timeout ?? 60,
      skipEnv: rc.hooks?.skip_env ?? "LINT_SKIP",
    });
  }

  // ── Step 6: Connect to Lint API (optional) ──
  const config: LintConfig = { uuid: `local-${Date.now()}`, repository: repoName };

  if (isLoggedIn()) {
    const username = getUsername() as string;
    const token = getToken() as string;

    const searchResult = await api.searchRepository(username, repoName, token);
    if (searchResult.data?.uuid) {
      config.uuid = searchResult.data.uuid;
      config.username = username;
      console.log(chalk.green(`  ✓ Connected to cloud: ${repoName}`));
    } else {
      const connectCloud = await confirm({
        message: "Create repository on Lint cloud? (team policies)",
        default: false,
      });

      if (connectCloud) {
        const createResult = await api.createRepository(
          username,
          token,
          repoName,
          "recommended",
          true,
        );
        if (createResult.data?.uuid) {
          config.uuid = createResult.data.uuid;
          config.username = username;
          console.log(chalk.green(`  ✓ Created on cloud: ${repoName}`));
        }
      }
    }
  }

  writeLintConfig(config);

  // ── Step 7: Add to .gitignore ──
  const gitignorePath = path.join(gitRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".lint/tmp")) {
      fs.appendFileSync(gitignorePath, "\n# Lint\n.lint/tmp/\n", "utf-8");
    }
  }

  // ── Done ──
  console.log(chalk.green.bold("\n  ✓ Lint initialized!\n"));
  console.log(`  Run ${chalk.cyan("lint")} to lint staged files.`);
  console.log(`  Run ${chalk.cyan("lint .")} to lint the entire project.`);
  console.log(`  Run ${chalk.cyan("lint ai review")} for AI code review.\n`);
}
