import chalk from "chalk";
import { createSpinner } from "nanospinner";
import * as api from "./api.js";
import { getToken, isLoggedIn } from "./auth.js";
import { findFiles, getCurrentBranch, getCurrentSha, getStagedFilePaths } from "./git.js";
import type { BaseLinter } from "./linters/base.js";
import { BiomeLinter } from "./linters/biome.js";
import { BrakemanLinter } from "./linters/brakeman.js";
import { ErbLintLinter } from "./linters/erblint.js";
import { ESLintLinter } from "./linters/eslint.js";
import { OxlintLinter } from "./linters/oxlint.js";
import { PrettierLinter } from "./linters/prettier.js";
import { PylintLinter } from "./linters/pylint.js";
import { RuboCopLinter } from "./linters/rubocop.js";
import { RuffLinter } from "./linters/ruff.js";
import { StylelintLinter } from "./linters/stylelint.js";
import { filterIgnoredFiles, loadRC, resolveEnabledLinters } from "./rc.js";
import { formatJsonReport, printReport, printSummaryTable } from "./reporter.js";
import type { LintReport, LinterName, LinterResult, PolicyRule, RunOptions } from "./types.js";
import { cleanTmpDir, formatDuration, readLintConfig } from "./utils.js";

// ── Linter registry ──

const ALL_LINTERS: BaseLinter[] = [
  new BiomeLinter(),
  new OxlintLinter(),
  new ESLintLinter(),
  new PrettierLinter(),
  new RuboCopLinter(),
  new ErbLintLinter(),
  new BrakemanLinter(),
  new StylelintLinter(),
  new RuffLinter(),
  new PylintLinter(),
];

const LINTER_MAP = new Map<LinterName, BaseLinter>(
  ALL_LINTERS.map((l) => [l.name as LinterName, l]),
);

// ── Linter selection with conflict resolution ──

function selectLinters(rc: ReturnType<typeof loadRC>): BaseLinter[] {
  const installed = ALL_LINTERS.filter((l) => l.isInstalled());
  const installedNames = installed.map((l) => l.name as LinterName);
  const enabledNames = resolveEnabledLinters(rc, installedNames);
  return installed.filter((l) => enabledNames.includes(l.name as LinterName));
}

// ── API helpers ──

async function fetchPolicyRules(): Promise<PolicyRule[]> {
  if (!isLoggedIn()) return [];
  const config = readLintConfig();
  if (!config?.uuid || config.uuid.startsWith("local-")) return [];
  const token = getToken();
  if (!token) return [];
  const result = await api.fetchPolicy(config.uuid, token);
  return result.data?.policy_rules || [];
}

async function createCommitAttempt(): Promise<number | null> {
  if (!isLoggedIn()) return null;
  const config = readLintConfig();
  if (!config?.uuid || config.uuid.startsWith("local-")) return null;
  const token = getToken();
  if (!token) return null;
  const sha = getCurrentSha();
  const branch = getCurrentBranch();
  const result = await api.createCommitAttempt(config.uuid, token, sha, branch);
  return result.data?.id || null;
}

async function sendReport(reports: LintReport[], commitAttemptId: number | null): Promise<void> {
  if (!isLoggedIn()) return;
  const config = readLintConfig();
  if (!config?.uuid || config.uuid.startsWith("local-")) return;
  const token = getToken();
  if (!token) return;
  try {
    // Try new v1 endpoint first, fall back to legacy
    await api.submitLintResults(token, {
      commit_attempt_id: commitAttemptId ?? undefined,
      repository_uuid: config.uuid,
      policy_check: {
        error_count: reports.reduce((s, r) => s + r.error_count, 0),
        warning_count: reports.reduce((s, r) => s + r.warning_count, 0),
        linters: reports.map((r) => ({
          name: r.linter,
          error_count: r.error_count,
          warning_count: r.warning_count,
        })),
      },
    });
  } catch {
    // Non-critical
  }
}

// ── Core linting engine ──

export async function runLint(options: RunOptions = {}): Promise<void> {
  const startTime = Date.now();
  const rc = loadRC();

  // Merge RC defaults with CLI options
  const autofix = options.fix ?? rc.fix?.enabled ?? false;
  const dryRun = options.dryRun ?? false;
  const verbose = options.verbose ?? false;
  const quiet = options.quiet ?? rc.output?.quiet ?? false;
  const format = options.format ?? rc.output?.format ?? "text";
  const isJson = format === "json";

  // ── Resolve files ──
  let files: string[];
  let mode: string;

  if (options.paths && options.paths.length > 0) {
    // Lint specific paths: `lint .`, `lint src/`, `lint file.ts`
    files = [];
    for (const p of options.paths) {
      files.push(...findFiles(p));
    }
    mode = options.paths.join(", ");
  } else {
    // Default: lint staged files
    files = getStagedFilePaths();
    mode = "staged files";
  }

  // Apply ignore patterns from .lintrc.yaml
  const ignorePatterns = rc.ignore || [];
  files = filterIgnoredFiles(files, ignorePatterns);

  if (files.length === 0) {
    if (isJson) {
      console.log(JSON.stringify({ success: true, files: 0, reports: [] }));
    } else if (!quiet) {
      console.log(chalk.green("No files to lint."));
    }
    return;
  }

  if (!quiet && !isJson) {
    const action = dryRun ? "Checking" : autofix ? "Fixing" : "Linting";
    console.log(chalk.cyan(`\nOmnilint — ${action} ${files.length} file(s) (${mode})...\n`));
  }

  // ── Fetch policy rules ──
  let policyRules: PolicyRule[] = [];
  try {
    policyRules = await fetchPolicyRules();
    if (verbose && !isJson && policyRules.length > 0) {
      console.log(chalk.gray(`  Loaded ${policyRules.length} policy rule(s) from API`));
    }
  } catch {
    if (verbose && !isJson) console.log(chalk.gray("  API offline — using linter defaults"));
  }

  const commitAttemptId = await createCommitAttempt().catch(() => null);

  // ── Select linters (with conflict resolution) ──
  const linters = selectLinters(rc);

  if (linters.length === 0) {
    if (isJson) {
      console.log(
        JSON.stringify({
          success: true,
          files: files.length,
          reports: [],
          message: "No linters available",
        }),
      );
    } else if (!quiet) {
      console.log(
        chalk.yellow("No linters available. Run 'lint init' to set up, or install one manually."),
      );
    }
    return;
  }

  if (verbose && !isJson) {
    console.log(chalk.gray(`  Linters: ${linters.map((l) => l.name).join(", ")}\n`));
  }

  // ── Run linters (parallel for different languages, sequential for same files) ──
  const results: LinterResult[] = [];
  let hasErrors = false;

  // Group linters by whether they overlap on file types
  const jsLinters = linters.filter((l) =>
    ["biome", "oxlint", "eslint", "prettier"].includes(l.name),
  );
  const otherLinters = linters.filter(
    (l) => !["biome", "oxlint", "eslint", "prettier"].includes(l.name),
  );

  // Run JS linters sequentially (they share files), others in parallel
  const runLinter = (linter: BaseLinter): LinterResult | null => {
    const relevantFiles = linter.selectFiles(files);
    if (relevantFiles.length === 0) return null;

    if (!quiet && !isJson) {
      const spinner = createSpinner(`${linter.name} (${relevantFiles.length} files)`).start();
      const result = linter.execute(files, policyRules, dryRun ? false : autofix);
      if (!result) {
        spinner.success({ text: `${linter.name} — skipped` });
        return null;
      }
      if (result.report.error_count > 0) {
        spinner.error({
          text: `${linter.name} — ${result.report.error_count} error(s), ${result.report.warning_count} warning(s)`,
        });
      } else if (result.report.warning_count > 0) {
        spinner.warn({ text: `${linter.name} — ${result.report.warning_count} warning(s)` });
      } else {
        spinner.success({ text: `${linter.name} — clean` });
      }
      return result;
    }

    return linter.execute(files, policyRules, dryRun ? false : autofix);
  };

  // Run JS linters sequentially (formatter first if configured)
  const fixStrategy = rc.fix?.strategy ?? "parallel";
  if (fixStrategy === "formatter-first" && autofix) {
    const formatters = jsLinters.filter((l) => ["prettier", "biome"].includes(l.name));
    const nonFormatters = jsLinters.filter((l) => !["prettier", "biome"].includes(l.name));
    for (const linter of [...formatters, ...nonFormatters]) {
      const result = runLinter(linter);
      if (result) {
        results.push(result);
        if (result.report.error_count > 0) hasErrors = true;
      }
    }
  } else {
    for (const linter of jsLinters) {
      const result = runLinter(linter);
      if (result) {
        results.push(result);
        if (result.report.error_count > 0) hasErrors = true;
      }
    }
  }

  // Run other linters (different languages — safe to parallelize)
  const otherResults = await Promise.all(otherLinters.map(async (linter) => runLinter(linter)));
  for (const result of otherResults) {
    if (result) {
      results.push(result);
      if (result.report.error_count > 0) hasErrors = true;
    }
  }

  // ── Output ──
  const reports = results.map((r) => r.report);
  const totalErrors = reports.reduce((s, r) => s + r.error_count, 0);
  const totalWarnings = reports.reduce((s, r) => s + r.warning_count, 0);
  const totalFixable = reports.reduce(
    (s, r) => s + r.fixable_error_count + r.fixable_warning_count,
    0,
  );
  const duration = Date.now() - startTime;

  if (isJson) {
    console.log(formatJsonReport(reports, { duration, dryRun, fix: autofix }));
  } else {
    // Detailed report
    if (reports.some((r) => r.error_count > 0 || r.warning_count > 0)) {
      printReport(reports, options.truncate);
      if (verbose) printSummaryTable(reports);
    }

    // Summary
    if (!quiet) {
      console.log("");
      if (dryRun && totalFixable > 0) {
        console.log(
          chalk.cyan(`  ${totalFixable} issue(s) would be fixed. Run without --dry-run to apply.`),
        );
      }
      if (totalErrors > 0) {
        console.log(chalk.red(`✗ ${totalErrors} error(s), ${totalWarnings} warning(s)`));
        if (totalFixable > 0 && !autofix) {
          console.log(chalk.yellow(`  ${totalFixable} auto-fixable. Run 'lint --fix' to fix.`));
        }
      } else if (totalWarnings > 0) {
        console.log(chalk.yellow(`⚠ ${totalWarnings} warning(s)`));
      } else {
        console.log(chalk.green("✓ All files passed."));
      }

      if (options.time) {
        console.log(chalk.gray(`  Done in ${formatDuration(duration)}`));
      }
    }
  }

  // ── Report to API ──
  await sendReport(reports, commitAttemptId);

  // ── Cleanup ──
  if (!options.keep) cleanTmpDir();

  // ── Exit codes: 0 = clean, 1 = errors, 2 = warnings only ──
  if (hasErrors) process.exit(1);
  if (totalWarnings > 0 && options.exitOnWarnings) process.exit(2);
}

// ── Convenience wrappers ──

export async function preCommit(options: RunOptions = {}): Promise<void> {
  return runLint({ ...options, time: options.time ?? true });
}

export async function lintStaged(options?: RunOptions): Promise<void> {
  return runLint(options);
}

export async function prepareCommitMsg(): Promise<void> {
  // No-op unless AI commit messages are configured
}

export async function postCommitHook(): Promise<void> {
  // No-op — reserved for future analytics
}

export async function prettifyProject(extension: string): Promise<void> {
  const prettier = new PrettierLinter();
  if (!prettier.isInstalled()) {
    console.log(chalk.red("Prettier is not installed. Run: npm install -g prettier"));
    return;
  }
  const spinner = createSpinner(`Formatting all .${extension} files...`).start();
  try {
    const { execSync } = await import("node:child_process");
    execSync(`prettier --write "**/*.${extension}"`, { encoding: "utf-8", stdio: "pipe" });
    spinner.success({ text: `All .${extension} files formatted.` });
  } catch (error) {
    spinner.error({ text: `Prettier failed: ${(error as Error).message}` });
  }
}

export { ALL_LINTERS, LINTER_MAP };
