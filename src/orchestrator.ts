import chalk from "chalk";
import { createSpinner } from "nanospinner";
import * as api from "./api.js";
import { getToken, getUsername, isLoggedIn } from "./auth.js";
import { getCurrentBranch, getCurrentSha, getStagedFilePaths } from "./git.js";
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
import { printReport, printSummaryTable } from "./reporter.js";
import type { LintReport, LinterResult, PolicyRule, PreCommitOptions } from "./types.js";
import { cleanTmpDir, formatDuration, readLintConfig } from "./utils.js";

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

function getAvailableLinters(): BaseLinter[] {
  return ALL_LINTERS.filter((linter) => linter.isInstalled());
}

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
  if (!isLoggedIn() || !commitAttemptId) return;

  const config = readLintConfig();
  if (!config?.uuid || config.uuid.startsWith("local-")) return;

  const token = getToken();
  if (!token) return;
  const totalErrors = reports.reduce((sum, r) => sum + r.error_count, 0);
  const totalWarnings = reports.reduce((sum, r) => sum + r.warning_count, 0);

  try {
    await api.postReport(token, {
      commit_attempt_id: commitAttemptId,
      repository_uuid: config.uuid,
      error_count: totalErrors,
      warning_count: totalWarnings,
      linters: reports.map((r) => ({
        name: r.linter,
        error_count: r.error_count,
        warning_count: r.warning_count,
      })),
    });
  } catch {
    // Non-critical: report sending failure shouldn't block the commit
  }
}

export async function preCommit(options: PreCommitOptions = {}): Promise<void> {
  const startTime = Date.now();

  const files = getStagedFilePaths();
  if (files.length === 0) {
    console.log(chalk.green("No staged files. Nothing to lint."));
    return;
  }

  const autofix = options.fix ?? false;
  const verbose = options.verbose ?? false;

  console.log(
    chalk.cyan(
      `\nOmnilint — ${autofix ? "Fixing" : "Linting"} ${files.length} staged file(s)...\n`,
    ),
  );

  // Fetch policy rules (non-blocking if API is down)
  let policyRules: PolicyRule[] = [];
  try {
    policyRules = await fetchPolicyRules();
    if (verbose && policyRules.length > 0) {
      console.log(chalk.gray(`  Loaded ${policyRules.length} policy rule(s) from API`));
    }
  } catch {
    if (verbose) console.log(chalk.gray("  API offline — using linter defaults"));
  }

  const commitAttemptId = await createCommitAttempt().catch(() => null);

  const available = getAvailableLinters();
  if (available.length === 0) {
    console.log(
      chalk.yellow("No linters detected. Install one: npm i -g eslint, pip install ruff, etc."),
    );
    return;
  }

  const results: LinterResult[] = [];
  let hasErrors = false;

  for (const linter of available) {
    const relevantFiles = linter.selectFiles(files);
    if (relevantFiles.length === 0) continue;

    const spinner = createSpinner(`${linter.name} (${relevantFiles.length} files)`).start();

    const result = linter.execute(files, policyRules, autofix);
    if (!result) {
      spinner.success({ text: `${linter.name} — skipped` });
      continue;
    }

    results.push(result);

    if (result.report.error_count > 0) {
      spinner.error({
        text: `${linter.name} — ${result.report.error_count} error(s), ${result.report.warning_count} warning(s)`,
      });
      hasErrors = true;
    } else if (result.report.warning_count > 0) {
      spinner.warn({
        text: `${linter.name} — ${result.report.warning_count} warning(s)`,
      });
    } else {
      spinner.success({ text: `${linter.name} — clean` });
    }
  }

  // Print detailed report
  const reports = results.map((r) => r.report);
  if (reports.some((r) => r.error_count > 0 || r.warning_count > 0)) {
    printReport(reports, options.truncate);
    if (verbose) {
      printSummaryTable(reports);
    }
  }

  // Send report to API
  await sendReport(reports, commitAttemptId);

  // Clean up
  if (!options.keep) {
    cleanTmpDir();
  }

  // Print summary
  const totalErrors = reports.reduce((sum, r) => sum + r.error_count, 0);
  const totalWarnings = reports.reduce((sum, r) => sum + r.warning_count, 0);
  const totalFixable = reports.reduce(
    (sum, r) => sum + r.fixable_error_count + r.fixable_warning_count,
    0,
  );

  console.log("");
  if (totalErrors > 0) {
    console.log(chalk.red(`✗ ${totalErrors} error(s), ${totalWarnings} warning(s)`));
    if (totalFixable > 0) {
      console.log(chalk.yellow(`  ${totalFixable} auto-fixable. Run 'lint --fix' to fix.`));
    }
  } else if (totalWarnings > 0) {
    console.log(chalk.yellow(`⚠ ${totalWarnings} warning(s)`));
  } else {
    console.log(chalk.green("✓ All files passed."));
  }

  if (options.time) {
    console.log(chalk.gray(`  Done in ${formatDuration(Date.now() - startTime)}`));
  }

  // Exit with error code if there are errors (blocks git commit)
  if (hasErrors) {
    process.exit(1);
  }
}

export async function lintStaged(
  options?: string | Pick<PreCommitOptions, "format" | "fix" | "verbose">,
): Promise<void> {
  if (typeof options === "string") {
    return preCommit({ format: options });
  }
  return preCommit(options);
}

export async function prepareCommitMsg(): Promise<void> {
  // Hook for prepare-commit-msg — currently a no-op
  // Future: AI commit message suggestion
}

export async function postCommitHook(): Promise<void> {
  // Hook for post-commit — currently a no-op
  // Future: post-commit analytics
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
    execSync(`prettier --write "**/*.${extension}"`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    spinner.success({ text: `All .${extension} files formatted.` });
  } catch (error) {
    spinner.error({ text: `Prettier failed: ${(error as Error).message}` });
  }
}

export { ALL_LINTERS };
