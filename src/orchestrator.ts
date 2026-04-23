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
import {
  filterIgnoredFiles,
  getIgnoredFileDecisions,
  getLinterReplacements,
  loadRC,
  resolveEnabledLinters,
} from "./rc.js";
import {
  formatMachineSummaryJson,
  formatJsonReport,
  formatRunDecisionJson,
  formatRunDecisionReport,
  printReport,
  printSummaryTable,
  type MachineSummaryReport,
  type RunDecisionReport,
} from "./reporter.js";
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

function describeLinterSelection(rc: ReturnType<typeof loadRC>): Array<{
  name: string;
  installed: boolean;
  enabled: boolean;
  selected: boolean;
  reason: string;
}> {
  const installedNames = ALL_LINTERS.filter((linter) => linter.isInstalled()).map(
    (linter) => linter.name as LinterName,
  );
  const selectedNames = new Set(resolveEnabledLinters(rc, installedNames));

  return ALL_LINTERS.map((linter) => {
    const name = linter.name as LinterName;
    const installed = installedNames.includes(name);
    const enabled = rc.linters?.enabled
      ? rc.linters.enabled.includes(name)
      : rc.linters?.disabled
        ? !rc.linters.disabled.includes(name)
        : installed;

    let reason = "available";
    if (!installed) {
      reason = "not installed";
    } else if (!selectedNames.has(name)) {
      reason = rc.linters?.enabled || rc.linters?.disabled ? "filtered by .lintrc" : "auto-resolved conflict";
    } else if (rc.linters?.enabled || rc.linters?.disabled) {
      reason = "selected by .lintrc";
    }

    return {
      name,
      installed,
      enabled,
      selected: selectedNames.has(name),
      reason,
    };
  });
}

function describeFileCoverage(
  files: string[],
  selection: Array<{
    name: string;
    installed: boolean;
    enabled: boolean;
    selected: boolean;
    reason: string;
  }>,
  linters: BaseLinter[],
): {
  coveredFiles: Array<{ path: string; linters: string[]; reason: string }>;
  uncoveredFiles: Array<{ path: string; reason: string }>;
} {
  const selectionByName = new Map(selection.map((entry) => [entry.name, entry]));
  const coverage = files.map((file) => {
    const selectedLinters = linters
      .filter((linter) => linter.selectFiles([file]).length > 0)
      .map((linter) => linter.name)
      .sort();
    const supportedByKnownLinters = ALL_LINTERS.filter((linter) => linter.selectFiles([file]).length > 0)
      .map((linter) => linter.name)
      .sort();
    const supportedInstalledLinters = supportedByKnownLinters.filter(
      (name) => selectionByName.get(name)?.installed,
    );
    const supportedEnabledLinters = supportedByKnownLinters.filter(
      (name) => selectionByName.get(name)?.enabled,
    );

    let reason = "selected linter matched this file";
    if (selectedLinters.length === 0) {
      if (supportedByKnownLinters.length === 0) {
        reason = "no known linter supports this file type";
      } else if (supportedInstalledLinters.length === 0) {
        reason = `supported by ${supportedByKnownLinters.join(", ")}, but those linters are not installed`;
      } else if (supportedEnabledLinters.length === 0) {
        reason = `supported by ${supportedInstalledLinters.join(", ")}, but disabled by configuration`;
      } else {
        reason = `supported by ${supportedEnabledLinters.join(", ")}, but none were selected`;
      }
    } else if (selectedLinters.length > 1) {
      reason = "multiple selected linters matched this file";
    }

    return {
      path: file,
      linters: selectedLinters,
      reason,
    };
  });

  return {
    coveredFiles: coverage.filter((entry) => entry.linters.length > 0),
    uncoveredFiles: coverage.filter((entry) => entry.linters.length === 0).map((entry) => ({
      path: entry.path,
      reason: entry.reason,
    })),
  };
}

function summarizePolicyRules(
  policyRules: PolicyRule[],
  linters: BaseLinter[],
): {
  source: "cloud" | "local";
  totalRules: number;
  applicableRules: number;
  byLinter: Record<string, number>;
} {
  const selectedLinterNames = new Set(linters.map((linter) => linter.name));
  const byLinter = Object.fromEntries(
    Object.entries(
      policyRules.reduce<Record<string, number>>((counts, rule) => {
        counts[rule.linter] = (counts[rule.linter] || 0) + 1;
        return counts;
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b)),
  );

  return {
    source: policyRules.length > 0 ? "cloud" : "local",
    totalRules: policyRules.length,
    applicableRules: policyRules.filter((rule) => selectedLinterNames.has(rule.linter)).length,
    byLinter,
  };
}

function describeResolvedConflicts(selection: Array<{
  name: string;
  installed: boolean;
  enabled: boolean;
  selected: boolean;
  reason: string;
}>): Array<{ winner: string; losers: string[]; reason: string }> {
  const replacements = getLinterReplacements();
  const selectionByName = new Map(selection.map((entry) => [entry.name, entry]));
  const conflicts: Array<{ winner: string; losers: string[]; reason: string }> = [];

  for (const [winner, losers] of Object.entries(replacements)) {
    const winnerSelection = selectionByName.get(winner);
    if (!winnerSelection?.selected) continue;

    const resolvedLosers = losers.filter((loser) => {
      const loserSelection = selectionByName.get(loser);
      return loserSelection?.installed && !loserSelection.selected;
    });

    if (resolvedLosers.length > 0) {
      conflicts.push({
        winner,
        losers: resolvedLosers,
        reason: "modern linter replacement rule",
      });
    }
  }

  return conflicts;
}

function describeNextSteps(report: {
  linterSelection: Array<{
    name: string;
    installed: boolean;
    enabled: boolean;
    selected: boolean;
    reason: string;
  }>;
  fileCoverage: {
    coveredFiles: Array<{ path: string; linters: string[]; reason: string }>;
    uncoveredFiles: Array<{ path: string; reason: string }>;
  };
  policy: {
    source: "cloud" | "local";
    totalRules: number;
    applicableRules: number;
    byLinter: Record<string, number>;
  };
}): string[] {
  const steps: string[] = [];
  const missingLinters = report.linterSelection.filter(
    (entry) => entry.reason === "not installed",
  );

  if (missingLinters.length > 0) {
    steps.push(
      `Install missing linters: ${missingLinters.map((entry) => entry.name).join(", ")} (or run 'lint install missing .')`,
    );
  }

  const uncoveredByMissingInstall = report.fileCoverage.uncoveredFiles.some((file) =>
    file.reason.includes("not installed"),
  );
  if (uncoveredByMissingInstall) {
    steps.push("Re-run after installing the missing linters to improve file coverage");
  }

  const unknownFiles = report.fileCoverage.uncoveredFiles.filter((file) =>
    file.reason.includes("no known linter supports this file type"),
  );
  if (unknownFiles.length > 0) {
    steps.push("Review uncovered file types to decide whether new linter support is needed");
  }

  if (report.policy.source === "cloud" && report.policy.totalRules > report.policy.applicableRules) {
    steps.push("Review cloud policy rules that target linters not currently selected in this repo");
  }

  return steps;
}

export async function collectRunDecisionReport(options: RunOptions = {}): Promise<RunDecisionReport> {
  const rc = loadRC();
  let discoveredFiles: string[];
  let mode: string;

  if (options.paths && options.paths.length > 0) {
    discoveredFiles = [];
    for (const p of options.paths) {
      discoveredFiles.push(...findFiles(p));
    }
    mode = options.paths.join(", ");
  } else {
    discoveredFiles = getStagedFilePaths();
    mode = "staged files";
  }

  const ignorePatterns = rc.ignore || [];
  const ignoredFiles = getIgnoredFileDecisions(discoveredFiles, ignorePatterns);
  const files = filterIgnoredFiles(discoveredFiles, ignorePatterns);
  const linterSelection = describeLinterSelection(rc);
  const selectedLinters = selectLinters(rc);
  const fileCoverage = describeFileCoverage(files, linterSelection, selectedLinters);
  const conflicts = describeResolvedConflicts(linterSelection);

  let policyRules: PolicyRule[] = [];
  try {
    policyRules = await fetchPolicyRules();
  } catch {
    policyRules = [];
  }

  const policy = summarizePolicyRules(policyRules, selectedLinters);

  return {
    cwd: process.cwd(),
    mode,
    requestedPaths: options.paths ?? [],
    discoveredFileCount: discoveredFiles.length,
    lintableFileCount: files.length,
    ignoredFiles,
    linterSelection,
    fileCoverage,
    policy,
    fixStrategy: {
      autofix: rc.fix?.enabled ?? false,
      strategy: rc.fix?.strategy ?? "parallel",
    },
    conflicts,
    nextSteps: describeNextSteps({
      linterSelection,
      fileCoverage,
      policy,
    }),
  };
}

export function buildMachineSummary(
  doctorStatus: "healthy" | "needs_setup",
  report: RunDecisionReport,
  missingSelectedLinters: string[],
): MachineSummaryReport {
  const actions: MachineSummaryReport["actions"] = [];
  const hasPolicyScopeGap = report.policy.totalRules > report.policy.applicableRules;
  const blockingReasons: string[] = [];
  const warningReasons: string[] = [];

  if (missingSelectedLinters.length > 0) {
    blockingReasons.push("missing_selected_linters");
    actions.push({
      id: "install_missing_linters",
      label: "Install missing linters",
      command: "lint install missing .",
      reason: `Missing selected linters: ${missingSelectedLinters.join(", ")}`,
    });
  }

  if (doctorStatus === "needs_setup") {
    blockingReasons.push("needs_setup");
    actions.push({
      id: "fix_setup",
      label: "Fix repo setup",
      command: "lint setup fix --dry-run",
      reason: "Repository setup is not yet healthy",
    });
  }

  if (report.fileCoverage.uncoveredFiles.length > 0) {
    blockingReasons.push("uncovered_files");
    actions.push({
      id: "explain_run",
      label: "Explain run coverage",
      command: "lint explain-run .",
      reason: `${report.fileCoverage.uncoveredFiles.length} file(s) are not covered by a selected linter`,
    });
  }

  if (hasPolicyScopeGap) {
    warningReasons.push("policy_scope_gap");
    actions.push({
      id: "review_policy_scope",
      label: "Review policy scope",
      command: "lint explain-run --json .",
      reason: "Some cloud policy rules target linters that are not currently selected",
    });
  }

  return {
    status: blockingReasons.length === 0 ? "ready" : "action_required",
    doctor_status: doctorStatus,
    run_mode: report.mode,
    selected_linters: report.linterSelection
      .filter((entry) => entry.selected)
      .map((entry) => entry.name),
    missing_selected_linters: missingSelectedLinters,
    uncovered_file_count: report.fileCoverage.uncoveredFiles.length,
    ignored_file_count: report.ignoredFiles.length,
    applicable_policy_rule_count: report.policy.applicableRules,
    blocking_reasons: blockingReasons,
    warning_reasons: warningReasons,
    signals: {
      needs_setup: doctorStatus !== "healthy",
      has_missing_selected_linters: missingSelectedLinters.length > 0,
      has_uncovered_files: report.fileCoverage.uncoveredFiles.length > 0,
      has_policy_scope_gap: hasPolicyScopeGap,
      is_actionable: actions.length > 0,
    },
    next_steps: report.nextSteps,
    actions,
    primary_action: actions[0] ?? null,
  };
}

export function getMachineSummaryExitCode(summary: MachineSummaryReport): number {
  if (summary.status === "action_required") return 1;
  return 0;
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
  if (!isLoggedIn() || !commitAttemptId) return;
  const config = readLintConfig();
  if (!config?.uuid || config.uuid.startsWith("local-")) return;
  const token = getToken();
  if (!token) return;
  try {
    await api.postReport(token, {
      commit_attempt_id: commitAttemptId,
      repository_uuid: config.uuid,
      error_count: reports.reduce((s, r) => s + r.error_count, 0),
      warning_count: reports.reduce((s, r) => s + r.warning_count, 0),
      linters: reports.map((r) => ({
        name: r.linter,
        error_count: r.error_count,
        warning_count: r.warning_count,
      })),
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
  const failOnWarnings = options.exitOnWarnings ?? false;

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
  const ignoredFiles = getIgnoredFileDecisions(files, ignorePatterns);
  files = filterIgnoredFiles(files, ignorePatterns);
  const linterSelection = describeLinterSelection(rc);
  const selectedLinters = selectLinters(rc);
  const fileCoverage = describeFileCoverage(files, linterSelection, selectedLinters);

  if (files.length === 0) {
    if (isJson) {
      console.log(
        formatJsonReport([], {
          duration: Date.now() - startTime,
          dryRun,
          fix: autofix,
          cwd: process.cwd(),
          mode,
          fileCount: 0,
          linterNames: [],
          policyRuleCount: 0,
          message: "No files to lint",
          failOnWarnings,
          requestedPaths: options.paths ?? [],
          ignoredFiles,
          linterSelection,
          fileCoverage,
          policySummary: summarizePolicyRules([], selectedLinters),
        }),
      );
    } else if (!quiet) {
      console.log(chalk.green("No files to lint."));
    }
    return;
  }

  if (!quiet && !isJson) {
    const action = dryRun ? "Checking" : autofix ? "Fixing" : "Linting";
    console.log(chalk.cyan(`\nLint — ${action} ${files.length} file(s) (${mode})...\n`));
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
  const linters = selectedLinters;

  if (linters.length === 0) {
    if (isJson) {
      console.log(
        formatJsonReport([], {
          duration: Date.now() - startTime,
          dryRun,
          fix: autofix,
          cwd: process.cwd(),
          mode,
          fileCount: files.length,
          linterNames: [],
          policyRuleCount: policyRules.length,
          message: "No linters available",
          failOnWarnings,
          requestedPaths: options.paths ?? [],
          ignoredFiles,
          linterSelection,
          fileCoverage,
          policySummary: summarizePolicyRules(policyRules, linters),
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
    console.log(
      formatJsonReport(reports, {
        duration,
        dryRun,
        fix: autofix,
        cwd: process.cwd(),
        mode,
        fileCount: files.length,
        linterNames: linters.map((linter) => linter.name),
        policyRuleCount: policyRules.length,
        failOnWarnings,
        requestedPaths: options.paths ?? [],
        ignoredFiles,
        linterSelection,
        fileCoverage,
        policySummary: summarizePolicyRules(policyRules, linters),
      }),
    );
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
  if (totalWarnings > 0 && failOnWarnings) process.exit(2);
}

export async function explainRun(
  options: RunOptions & { json?: boolean } = {},
): Promise<void> {
  const report = await collectRunDecisionReport(options);
  if (options.json) {
    console.log(formatRunDecisionJson(report));
    return;
  }

  for (const line of formatRunDecisionReport(report)) {
    console.log(line);
  }
}

export async function machineSummary(
  options: RunOptions & {
    doctorStatus: "healthy" | "needs_setup";
    missingSelectedLinters: string[];
    strict?: boolean;
  },
): Promise<void> {
  const report = await collectRunDecisionReport(options);
  const summary = buildMachineSummary(options.doctorStatus, report, options.missingSelectedLinters);
  console.log(formatMachineSummaryJson(summary));
  if (options.strict) {
    const exitCode = getMachineSummaryExitCode(summary);
    if (exitCode !== 0) process.exit(exitCode);
  }
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
