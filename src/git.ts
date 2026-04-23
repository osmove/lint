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
import { ensureDir, exec, findGitRoot, readLintConfig, writeLintConfig } from "./utils.js";

// ── Staged files ──

export function getStagedFiles(): StagedFile[] {
  try {
    const output = exec("git status -s", { silent: true });
    if (!output) return [];

    return output
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const statusCode = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();
        let status: StagedFile["status"];

        switch (statusCode) {
          case "A":
            status = "added";
            break;
          case "D":
            status = "deleted";
            break;
          case "R":
            status = "renamed";
            break;
          default:
            status = "modified";
        }

        return { path: filePath, status };
      });
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
    return exec("git rev-parse HEAD", { silent: true });
  } catch {
    return "unknown";
  }
}

export function getCurrentBranch(): string {
  try {
    return exec("git rev-parse --abbrev-ref HEAD", { silent: true });
  } catch {
    return "unknown";
  }
}

export function getStagedDiff(): string {
  try {
    return exec("git diff --cached", { silent: true });
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

function hookContent(command: string, timeout: number, skipEnv: string): string {
  return `#!/bin/sh
# Installed by Lint
# Skip: ${skipEnv}=1 git commit ...
# Skip: git commit --no-verify

[ "$${skipEnv}" = "1" ] && exit 0

if command -v lint >/dev/null 2>&1; then
  timeout ${timeout} lint ${command} "$@"
elif command -v npx >/dev/null 2>&1; then
  timeout ${timeout} npx --no-install lint ${command} "$@"
else
  echo "Lint: lint command not found. Skipping hook."
  exit 0
fi
`;
}

export function installHooks(options?: { timeout?: number; skipEnv?: string }): void {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("Not inside a git repository."));
    return;
  }

  const timeout = options?.timeout ?? 60;
  const skipEnv = options?.skipEnv ?? "LINT_SKIP";

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

  const hooksDir = path.join(gitRoot, ".git", "hooks");
  ensureDir(hooksDir);

  const hooks: Record<string, string> = {
    "pre-commit": hookContent("pre-commit -t", timeout, skipEnv),
    "prepare-commit-msg": hookContent("prepare-commit-msg", timeout, skipEnv),
    "post-commit": hookContent("post-commit", timeout, skipEnv),
  };

  for (const [name, content] of Object.entries(hooks)) {
    const hookPath = path.join(hooksDir, name);

    // Backup existing non-Lint hook
    if (fs.existsSync(hookPath)) {
      const existingContent = fs.readFileSync(hookPath, "utf-8");
      if (!existingContent.includes("Installed by Lint")) {
        const backupDir = path.join(hooksDir, `backup_${Date.now()}`);
        ensureDir(backupDir);
        fs.copyFileSync(hookPath, path.join(backupDir, name));
      }
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

  const hooksDir = path.join(gitRoot, ".git", "hooks");
  const hookNames = ["pre-commit", "prepare-commit-msg", "post-commit"];

  for (const name of hookNames) {
    const hookPath = path.join(hooksDir, name);
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, "utf-8");
      if (content.includes("Installed by Lint")) {
        fs.unlinkSync(hookPath);
        console.log(chalk.yellow(`  ✗ ${name} removed`));
      }
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
