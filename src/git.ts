import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";
import { input, confirm, select } from "@inquirer/prompts";
import type { LintConfig, StagedFile } from "./types.js";
import { exec, findGitRoot, ensureDir, readLintConfig, writeLintConfig, getDotLintDir } from "./utils.js";
import { getUsername, getToken, isLoggedIn } from "./auth.js";
import * as api from "./api.js";

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

// ── Git hooks ──

const HOOK_SHEBANG = "#!/bin/sh";

function hookContent(command: string): string {
  return `${HOOK_SHEBANG}
# Installed by Omnilint
npx --no-install lint ${command} "$@"
`;
}

export function installHooks(): void {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("Not inside a git repository."));
    return;
  }

  const hooksDir = path.join(gitRoot, ".git", "hooks");
  ensureDir(hooksDir);

  const hooks: Record<string, string> = {
    "pre-commit": hookContent("pre-commit"),
    "prepare-commit-msg": hookContent("prepare-commit-msg"),
    "post-commit": hookContent("post-commit"),
  };

  for (const [name, content] of Object.entries(hooks)) {
    const hookPath = path.join(hooksDir, name);

    // Backup existing hook
    if (fs.existsSync(hookPath)) {
      const backupDir = path.join(hooksDir, `backup_${Date.now()}`);
      ensureDir(backupDir);
      fs.copyFileSync(hookPath, path.join(backupDir, name));
    }

    fs.writeFileSync(hookPath, content, { mode: 0o755 });
    console.log(chalk.green(`  ✓ ${name}`));
  }

  console.log(chalk.green("\nGit hooks installed."));
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
      if (content.includes("Omnilint")) {
        fs.unlinkSync(hookPath);
        console.log(chalk.yellow(`  ✗ ${name} removed`));
      }
    }
  }

  console.log("Git hooks uninstalled.");
}

// ── Repository initialization ──

export async function init(): Promise<void> {
  const gitRoot = findGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("Not inside a git repository. Run 'git init' first."));
    return;
  }

  const repoName = path.basename(gitRoot);

  // Check existing config
  const existing = readLintConfig();
  if (existing?.uuid) {
    console.log(chalk.yellow(`Repository already initialized (${existing.uuid}).`));
    const reinit = await confirm({ message: "Re-initialize?" });
    if (!reinit) return;
  }

  if (!isLoggedIn()) {
    console.log(chalk.yellow("Not logged in. Initializing in offline mode."));
    const config: LintConfig = { uuid: `local-${Date.now()}`, repository: repoName };
    writeLintConfig(config);
    console.log(chalk.green(`Initialized ${repoName} in offline mode.`));
    return;
  }

  const username = getUsername()!;
  const token = getToken()!;

  // Try to find existing repo on server
  const searchResult = await api.searchRepository(username, repoName, token);
  if (searchResult.data?.uuid) {
    const config: LintConfig = {
      uuid: searchResult.data.uuid,
      username,
      repository: repoName,
    };
    writeLintConfig(config);
    console.log(chalk.green(`Connected to existing repository: ${repoName}`));
    return;
  }

  // Create new repo on server
  const name = await input({
    message: "Repository name:",
    default: repoName,
  });

  const policy = await select({
    message: "Linting policy:",
    choices: [
      { name: "Recommended (default)", value: "recommended" },
      { name: "Strict", value: "strict" },
      { name: "Relaxed", value: "relaxed" },
    ],
  });

  const autofix = await confirm({
    message: "Enable auto-fix?",
    default: true,
  });

  const createResult = await api.createRepository(username, token, name, policy, autofix);
  if (createResult.data?.uuid) {
    const config: LintConfig = {
      uuid: createResult.data.uuid,
      username,
      repository: name,
    };
    writeLintConfig(config);

    // Add .lint/config to git
    try {
      exec(`git add ${path.join(".lint", "config")}`, { silent: true });
    } catch {
      // Non-critical
    }

    console.log(chalk.green(`Repository ${name} created and initialized.`));
  } else {
    console.log(chalk.red("Failed to create repository on server."));
    console.log("Initializing in offline mode...");
    const config: LintConfig = { uuid: `local-${Date.now()}`, repository: name };
    writeLintConfig(config);
  }
}
