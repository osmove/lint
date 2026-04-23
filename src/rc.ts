import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { LinterName } from "./types.js";
import { findGitRoot } from "./utils.js";

// ── .lintrc.yaml schema ──

export interface LintRC {
  linters?: {
    enabled?: LinterName[];
    disabled?: LinterName[];
  };
  rules?: Record<string, Record<string, unknown>>;
  ignore?: string[];
  fix?: {
    enabled?: boolean;
    strategy?: "parallel" | "sequential" | "formatter-first";
  };
  hooks?: {
    timeout?: number;
    skip_env?: string;
  };
  output?: {
    format?: "text" | "json";
    quiet?: boolean;
  };
}

const RC_FILENAMES = [".lintrc.yaml", ".lintrc.yml", ".lintrc.json"];

// Linters that overlap — when a modern linter is enabled, disable its legacy equivalent
const LINTER_REPLACEMENTS: Record<string, LinterName[]> = {
  biome: ["eslint", "prettier", "oxlint"],
  oxlint: ["eslint"],
  ruff: ["pylint"],
};

export function getLinterReplacements(): Record<LinterName, LinterName[]> {
  return LINTER_REPLACEMENTS as Record<LinterName, LinterName[]>;
}

export function findRCFile(): string | null {
  const gitRoot = findGitRoot() || process.cwd();
  for (const name of RC_FILENAMES) {
    const filePath = path.join(gitRoot, name);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

export function loadRC(): LintRC {
  const filePath = findRCFile();
  if (!filePath) return {};

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    if (filePath.endsWith(".json")) {
      return JSON.parse(content) as LintRC;
    }
    return (yaml.load(content) as LintRC) || {};
  } catch {
    return {};
  }
}

export function writeRC(rc: LintRC): void {
  const gitRoot = findGitRoot() || process.cwd();
  const filePath = path.join(gitRoot, ".lintrc.yaml");
  const content = yaml.dump(rc, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

export function resolveEnabledLinters(rc: LintRC, allLinterNames: LinterName[]): LinterName[] {
  let enabled: LinterName[];

  if (rc.linters?.enabled) {
    // Explicit allow-list
    enabled = rc.linters.enabled;
  } else if (rc.linters?.disabled) {
    // Everything except deny-list
    enabled = allLinterNames.filter((n) => !rc.linters?.disabled?.includes(n));
  } else {
    // No config → auto-resolve conflicts from available linters
    enabled = autoResolveConflicts(allLinterNames);
  }

  return enabled;
}

export function autoResolveConflicts(available: LinterName[]): LinterName[] {
  const disabled = new Set<LinterName>();

  for (const [modern, legacy] of Object.entries(LINTER_REPLACEMENTS)) {
    if (available.includes(modern as LinterName)) {
      for (const old of legacy) {
        if (available.includes(old)) {
          disabled.add(old);
        }
      }
    }
  }

  return available.filter((n) => !disabled.has(n));
}

export function shouldIgnoreFile(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching: ** = any path, * = any segment
    const regex = new RegExp(
      `^${pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "{{GLOBSTAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/\{\{GLOBSTAR\}\}/g, ".*")}$`,
    );
    if (regex.test(filePath)) return true;
  }
  return false;
}

export function filterIgnoredFiles(files: string[], patterns: string[]): string[] {
  if (patterns.length === 0) return files;
  return files.filter((f) => !shouldIgnoreFile(f, patterns));
}

export function getIgnoredFileDecisions(
  files: string[],
  patterns: string[],
): Array<{ path: string; reason: string }> {
  if (patterns.length === 0) return [];

  const ignored: Array<{ path: string; reason: string }> = [];
  for (const file of files) {
    const matchedPattern = patterns.find((pattern) => shouldIgnoreFile(file, [pattern]));
    if (matchedPattern) {
      ignored.push({
        path: file,
        reason: `matched ignore pattern '${matchedPattern}'`,
      });
    }
  }

  return ignored;
}

export function generateDefaultRC(linters: LinterName[]): LintRC {
  return {
    linters: {
      enabled: linters,
    },
    ignore: ["node_modules/**", "dist/**", "build/**", "coverage/**", ".git/**"],
    fix: {
      enabled: true,
      strategy: "formatter-first",
    },
    hooks: {
      timeout: 60,
      skip_env: "LINT_SKIP",
    },
  };
}
