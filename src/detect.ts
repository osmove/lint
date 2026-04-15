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

  // Detect languages
  for (const rule of DETECTION_RULES) {
    for (const file of rule.files) {
      if (fs.existsSync(path.join(root, file))) {
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
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const extensions = new Set<string>();
    for (const entry of entries) {
      if (entry.isFile()) {
        extensions.add(path.extname(entry.name).toLowerCase());
      }
    }
    // Check src/ too if it exists
    const srcDir = path.join(root, "src");
    if (fs.existsSync(srcDir)) {
      for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.isFile()) extensions.add(path.extname(entry.name).toLowerCase());
      }
    }

    if (
      (extensions.has(".css") || extensions.has(".scss") || extensions.has(".sass")) &&
      !result.languages.some((l) => l.name === "CSS/SCSS")
    ) {
      result.languages.push({
        name: "CSS/SCSS",
        reason: "*.css files found",
        suggestedLinters: ["stylelint"],
      });
    }

    if (extensions.has(".erb") && !result.languages.some((l) => l.name === "ERB")) {
      result.languages.push({
        name: "ERB",
        reason: "*.erb files found",
        suggestedLinters: ["erblint"],
      });
    }
  } catch {
    // Skip if can't read directory
  }

  // Detect frameworks
  for (const fw of FRAMEWORK_SIGNALS) {
    for (const file of fw.files) {
      if (fs.existsSync(path.join(root, file))) {
        result.frameworks.push(fw.name);
        // Add extra linters to relevant language
        for (const linter of fw.extraLinters) {
          const lang = result.languages.find((l) => l.suggestedLinters.length > 0);
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
