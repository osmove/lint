import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { LinterName } from "./types.js";
import { findGitRoot, isCommandAvailable } from "./utils.js";

export interface DetectedProject {
  languages: DetectedLanguage[];
  packageManagers: string[];
  frameworks: string[];
  hasHusky: boolean;
  hasLefthook: boolean;
}

export interface DetectedLanguage {
  name: string;
  reason: string;
  suggestedLinters: LinterName[];
}

export interface SuggestedLinterPlanEntry {
  name: LinterName;
  installed: boolean;
  reasons: string[];
}

const SCAN_IGNORED_DIRS = new Set([
  ".git",
  ".idea",
  ".next",
  ".nuxt",
  ".venv",
  ".yarn",
  ".pnpm-store",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
  "vendor",
]);

const DETECTION_RULES: Array<{
  files: string[];
  language: string;
  linters: LinterName[];
}> = [
  {
    files: ["package.json", "tsconfig.json", ".nvmrc", "node_modules"],
    language: "JavaScript/TypeScript",
    linters: ["biome"],
  },
  {
    files: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", ".python-version"],
    language: "Python",
    linters: ["ruff"],
  },
  {
    files: ["Gemfile", ".ruby-version", "Rakefile", ".rubocop.yml"],
    language: "Ruby",
    linters: ["rubocop"],
  },
  {
    files: [".stylelintrc", ".stylelintrc.json", "postcss.config.js"],
    language: "CSS/SCSS",
    linters: ["stylelint"],
  },
];

const FRAMEWORK_SIGNALS: Array<{ files: string[]; name: string; extraLinters: LinterName[] }> = [
  {
    files: ["config/routes.rb", "bin/rails", "Gemfile"],
    name: "Rails",
    extraLinters: ["brakeman", "erblint"],
  },
  {
    files: ["next.config.js", "next.config.ts", "next.config.mjs"],
    name: "Next.js",
    extraLinters: [],
  },
  { files: ["nuxt.config.ts", "nuxt.config.js"], name: "Nuxt", extraLinters: [] },
  { files: ["django", "manage.py"], name: "Django", extraLinters: [] },
];

export function detectProject(rootDir?: string): DetectedProject {
  const root = rootDir || findGitRoot() || process.cwd();
  const result: DetectedProject = {
    languages: [],
    packageManagers: [],
    frameworks: [],
    hasHusky: false,
    hasLefthook: false,
  };
  const discoveredPaths = new Set<string>();
  const discoveredExtensions = new Set<string>();

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name.startsWith(".") &&
        entry.name !== ".ruby-version" &&
        entry.name !== ".python-version" &&
        entry.name !== ".stylelintrc" &&
        entry.name !== ".stylelintrc.json" &&
        entry.name !== ".rubocop.yml" &&
        entry.name !== ".nvmrc"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        if (!SCAN_IGNORED_DIRS.has(entry.name)) {
          discoveredPaths.add(relativePath);
          walk(fullPath);
        }
        continue;
      }

      if (entry.isFile()) {
        discoveredPaths.add(relativePath);
        discoveredExtensions.add(path.extname(entry.name).toLowerCase());
      }
    }
  }

  try {
    walk(root);
  } catch {
    // Best-effort scan
  }

  // Detect languages
  for (const rule of DETECTION_RULES) {
    for (const file of rule.files) {
      if (discoveredPaths.has(file) || fs.existsSync(path.join(root, file))) {
        if (!result.languages.some((l) => l.name === rule.language)) {
          result.languages.push({
            name: rule.language,
            reason: file,
            suggestedLinters: [...rule.linters],
          });
        }
        break;
      }
    }
  }

  // Also scan for files by extension
  if (
    (discoveredExtensions.has(".css") ||
      discoveredExtensions.has(".scss") ||
      discoveredExtensions.has(".sass") ||
      discoveredExtensions.has(".less")) &&
    !result.languages.some((l) => l.name === "CSS/SCSS")
  ) {
    result.languages.push({
      name: "CSS/SCSS",
      reason: "stylesheets found",
      suggestedLinters: ["stylelint"],
    });
  }

  if (discoveredExtensions.has(".erb") && !result.languages.some((l) => l.name === "ERB")) {
    result.languages.push({
      name: "ERB",
      reason: "*.erb files found",
      suggestedLinters: ["erblint"],
    });
  }

  // Detect frameworks
  for (const fw of FRAMEWORK_SIGNALS) {
    for (const file of fw.files) {
      if (discoveredPaths.has(file) || fs.existsSync(path.join(root, file))) {
        if (!result.frameworks.includes(fw.name)) {
          result.frameworks.push(fw.name);
        }

        const preferredLanguage =
          fw.name === "Rails"
            ? ["Ruby", "ERB"]
            : fw.name === "Django"
              ? ["Python"]
              : ["JavaScript/TypeScript"];

        for (const linter of fw.extraLinters) {
          const lang =
            result.languages.find((candidate) => preferredLanguage.includes(candidate.name)) ||
            result.languages.find((candidate) => candidate.suggestedLinters.length > 0);
          if (lang && !lang.suggestedLinters.includes(linter)) {
            lang.suggestedLinters.push(linter);
          }
        }
        break;
      }
    }
  }

  // Detect package managers
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) result.packageManagers.push("pnpm");
  else if (fs.existsSync(path.join(root, "yarn.lock"))) result.packageManagers.push("yarn");
  else if (fs.existsSync(path.join(root, "package-lock.json"))) result.packageManagers.push("npm");
  if (fs.existsSync(path.join(root, "Gemfile.lock"))) result.packageManagers.push("bundler");
  if (fs.existsSync(path.join(root, "Pipfile.lock"))) result.packageManagers.push("pipenv");
  if (fs.existsSync(path.join(root, "poetry.lock"))) result.packageManagers.push("poetry");

  // Detect existing hook managers
  result.hasHusky = fs.existsSync(path.join(root, ".husky"));
  result.hasLefthook =
    fs.existsSync(path.join(root, "lefthook.yml")) ||
    fs.existsSync(path.join(root, ".lefthook.yml"));

  return result;
}

export function getAllSuggestedLinters(project: DetectedProject): LinterName[] {
  const linters = new Set<LinterName>();
  for (const lang of project.languages) {
    for (const l of lang.suggestedLinters) {
      linters.add(l);
    }
  }
  return [...linters];
}

export function checkLinterInstallation(
  linters: LinterName[],
): Array<{ name: LinterName; installed: boolean }> {
  const commands: Record<LinterName, string> = {
    eslint: "eslint",
    prettier: "prettier",
    rubocop: "rubocop",
    erblint: "erblint",
    brakeman: "brakeman",
    stylelint: "stylelint",
    pylint: "pylint",
    biome: "biome",
    ruff: "ruff",
    oxlint: "oxlint",
  };

  return linters.map((name) => ({
    name,
    installed: isCommandAvailable(commands[name]),
  }));
}

export function buildSuggestedLinterPlan(
  project: DetectedProject,
  installStatus = checkLinterInstallation(getAllSuggestedLinters(project)),
): SuggestedLinterPlanEntry[] {
  const reasonsByLinter = new Map<LinterName, Set<string>>();

  for (const language of project.languages) {
    for (const linter of language.suggestedLinters) {
      const existing = reasonsByLinter.get(linter) || new Set<string>();
      existing.add(`${language.name} (${language.reason})`);
      reasonsByLinter.set(linter, existing);
    }
  }

  return installStatus
    .map((entry) => ({
      name: entry.name,
      installed: entry.installed,
      reasons: [...(reasonsByLinter.get(entry.name) || new Set<string>())].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function printDetectionSummary(project: DetectedProject): void {
  if (project.languages.length === 0) {
    console.log(chalk.yellow("  No languages detected."));
    return;
  }

  for (const lang of project.languages) {
    console.log(`  ${chalk.cyan(lang.name)} ${chalk.gray(`(${lang.reason})`)}`);
  }

  if (project.frameworks.length > 0) {
    console.log(`  Frameworks: ${project.frameworks.map((f) => chalk.magenta(f)).join(", ")}`);
  }
}
