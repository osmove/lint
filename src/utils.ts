import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { LintConfig } from "./types.js";

export function exec(command: string, options?: { cwd?: string; silent?: boolean }): string {
  try {
    return execSync(command, {
      cwd: options?.cwd,
      encoding: "utf-8",
      stdio: options?.silent ? "pipe" : ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    }).trim();
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    if (err.stdout) return err.stdout.toString().trim();
    throw error;
  }
}

export function isCommandAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function findGitRoot(startDir?: string): string | null {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      cwd: startDir || process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    });
    return result.trim();
  } catch {
    return null;
  }
}

export function getDotLintDir(): string | null {
  const gitRoot = findGitRoot();
  if (!gitRoot) return null;
  return path.join(gitRoot, ".lint");
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function readLintConfig(): LintConfig | null {
  const dotLint = getDotLintDir();
  if (!dotLint) return null;
  const configPath = path.join(dotLint, "config");
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return yaml.load(content) as LintConfig;
  } catch {
    return null;
  }
}

export function writeLintConfig(config: LintConfig): void {
  const dotLint = getDotLintDir();
  if (!dotLint) throw new Error("Not inside a git repository");
  ensureDir(dotLint);
  const configPath = path.join(dotLint, "config");
  fs.writeFileSync(configPath, yaml.dump(config), "utf-8");
}

export function cleanTmpDir(): void {
  const dotLint = getDotLintDir();
  if (!dotLint) return;
  const tmpDir = path.join(dotLint, "tmp");
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function ensureTmpDir(): string {
  const dotLint = getDotLintDir();
  if (!dotLint) throw new Error("Not inside a git repository");
  const tmpDir = path.join(dotLint, "tmp");
  ensureDir(tmpDir);
  return tmpDir;
}

export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function filterFilesByExtensions(files: string[], extensions: string[]): string[] {
  return files.filter((file) => extensions.includes(getFileExtension(file)));
}

export function getRelevantSource(filePath: string, line: number, context = 2): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const start = Math.max(0, line - context - 1);
    const end = Math.min(lines.length, line + context);
    return lines.slice(start, end);
  } catch {
    return [];
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
