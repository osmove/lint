import chalk from "chalk";
import Table from "cli-table3";
import type { LintReport } from "./types.js";

export const LINT_JSON_SCHEMA_VERSION = "1";

export interface JsonReportMeta {
  duration: number;
  dryRun?: boolean;
  fix?: boolean;
  cwd?: string;
  mode?: string;
  fileCount?: number;
  linterNames?: string[];
  policyRuleCount?: number;
  message?: string;
  failOnWarnings?: boolean;
  requestedPaths?: string[];
  ignoredFiles?: Array<{ path: string; reason: string }>;
  linterSelection?: Array<{
    name: string;
    installed: boolean;
    enabled: boolean;
    selected: boolean;
    reason: string;
  }>;
  fileCoverage?: {
    coveredFiles: Array<{ path: string; linters: string[]; reason: string }>;
    uncoveredFiles: Array<{ path: string; reason: string }>;
  };
  policySummary?: {
    source: "cloud" | "local";
    totalRules: number;
    applicableRules: number;
    byLinter: Record<string, number>;
  };
}

export interface RunDecisionReport {
  cwd: string;
  mode: string;
  requestedPaths: string[];
  discoveredFileCount: number;
  lintableFileCount: number;
  ignoredFiles: Array<{ path: string; reason: string }>;
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
  fixStrategy: {
    autofix: boolean;
    strategy: string;
  };
  conflicts: Array<{
    winner: string;
    losers: string[];
    reason: string;
  }>;
  nextSteps: string[];
}

type JsonRunStatus =
  | "passed"
  | "passed_with_warnings"
  | "failed"
  | "failed_on_warnings"
  | "skipped";

function resolveJsonOutcome(
  reports: LintReport[],
  meta: JsonReportMeta,
): { status: JsonRunStatus; exitCode: number } {
  const totalErrors = reports.reduce((s, r) => s + r.error_count, 0);
  const totalWarnings = reports.reduce((s, r) => s + r.warning_count, 0);

  if (reports.length === 0 && meta.message) {
    return { status: "skipped", exitCode: 0 };
  }

  if (totalErrors > 0) {
    return { status: "failed", exitCode: 1 };
  }

  if (totalWarnings > 0 && meta.failOnWarnings) {
    return { status: "failed_on_warnings", exitCode: 2 };
  }

  if (totalWarnings > 0) {
    return { status: "passed_with_warnings", exitCode: 0 };
  }

  return { status: "passed", exitCode: 0 };
}

export function printReport(reports: LintReport[], truncate = false): void {
  for (const report of reports) {
    if (report.error_count === 0 && report.warning_count === 0) continue;

    console.log(chalk.bold(`\n─── ${report.linter.toUpperCase()} ───\n`));

    for (const file of report.files) {
      if (file.offenses.length === 0) continue;

      console.log(chalk.underline(file.path));

      const offenses = truncate ? file.offenses.slice(0, 10) : file.offenses;

      for (const offense of offenses) {
        const severity =
          offense.severity === "error"
            ? chalk.red("error")
            : offense.severity === "warning"
              ? chalk.yellow("warn ")
              : chalk.blue("info ");

        const location = chalk.gray(`${offense.line}:${offense.column}`);
        const rule = chalk.gray(offense.rule);
        const fixable = offense.fixable ? chalk.green(" [fixable]") : "";

        console.log(`  ${location}  ${severity}  ${offense.message}  ${rule}${fixable}`);
      }

      if (truncate && file.offenses.length > 10) {
        console.log(chalk.gray(`  ... and ${file.offenses.length - 10} more`));
      }

      console.log("");
    }
  }
}

export function printSummaryTable(reports: LintReport[]): void {
  const table = new Table({
    head: [
      chalk.white("Linter"),
      chalk.red("Errors"),
      chalk.yellow("Warnings"),
      chalk.green("Fixable"),
    ],
    style: { head: [], border: [] },
  });

  for (const report of reports) {
    if (report.error_count === 0 && report.warning_count === 0) continue;
    table.push([
      report.linter,
      report.error_count.toString(),
      report.warning_count.toString(),
      (report.fixable_error_count + report.fixable_warning_count).toString(),
    ]);
  }

  if (table.length > 0) {
    console.log(table.toString());
  }
}

export function formatJsonReport(
  reports: LintReport[],
  meta: JsonReportMeta,
): string {
  const totalErrors = reports.reduce((s, r) => s + r.error_count, 0);
  const totalWarnings = reports.reduce((s, r) => s + r.warning_count, 0);
  const totalFixable = reports.reduce(
    (s, r) => s + r.fixable_error_count + r.fixable_warning_count,
    0,
  );
  const outcome = resolveJsonOutcome(reports, meta);

  return JSON.stringify(
    {
      schema_version: LINT_JSON_SCHEMA_VERSION,
      kind: "lint_run",
      success: outcome.exitCode === 0,
      status: outcome.status,
      exit_code: outcome.exitCode,
      summary: {
        errors: totalErrors,
        warnings: totalWarnings,
        fixable: totalFixable,
        duration_ms: meta.duration,
        dry_run: meta.dryRun ?? false,
        auto_fix: meta.fix ?? false,
      },
      run: {
        cwd: meta.cwd ?? process.cwd(),
        mode: meta.mode ?? "staged files",
        file_count: meta.fileCount ?? reports.reduce((sum, report) => sum + report.files.length, 0),
        linters: meta.linterNames ?? reports.map((report) => report.linter),
        policy_rule_count: meta.policyRuleCount ?? 0,
        requested_paths: meta.requestedPaths ?? [],
      },
      decisions: {
        ignored_files: meta.ignoredFiles ?? [],
        linter_selection: meta.linterSelection ?? [],
        file_coverage: meta.fileCoverage ?? {
          coveredFiles: [],
          uncoveredFiles: [],
        },
        policy: meta.policySummary ?? {
          source: "local",
          totalRules: meta.policyRuleCount ?? 0,
          applicableRules: meta.policyRuleCount ?? 0,
          byLinter: {},
        },
      },
      ...(meta.message ? { message: meta.message } : {}),
      linters: reports.map((r) => ({
        name: r.linter,
        errors: r.error_count,
        warnings: r.warning_count,
        fixable: r.fixable_error_count + r.fixable_warning_count,
        files: r.files.map((f) => ({
          path: f.path,
          offenses: f.offenses.map((o) => ({
            line: o.line,
            column: o.column,
            rule: o.rule,
            message: o.message,
            severity: o.severity,
            fixable: o.fixable ?? false,
          })),
        })),
      })),
    },
    null,
    2,
  );
}

export function formatRunDecisionReport(report: RunDecisionReport): string[] {
  const lines: string[] = [];

  lines.push("  Lint Explain Run");
  lines.push("");
  lines.push(`  CWD: ${report.cwd}`);
  lines.push(`  Mode: ${report.mode}`);
  lines.push(
    `  Files: ${report.lintableFileCount} lintable / ${report.discoveredFileCount} discovered`,
  );
  lines.push(
    `  Policy: ${report.policy.source} (${report.policy.applicableRules}/${report.policy.totalRules} applicable rules)`,
  );
  lines.push(
    `  Fix strategy: ${report.fixStrategy.autofix ? "autofix enabled" : "check only"} (${report.fixStrategy.strategy})`,
  );

  if (report.conflicts.length > 0) {
    lines.push("");
    lines.push("  Resolved Conflicts:");
    lines.push("");
    for (const conflict of report.conflicts) {
      lines.push(
        `    ✓ ${conflict.winner} over ${conflict.losers.join(", ")} (${conflict.reason})`,
      );
    }
  }

  lines.push("");
  lines.push("  Selected Linters:");
  lines.push("");
  for (const linter of report.linterSelection.filter((entry) => entry.selected)) {
    lines.push(`    ✓ ${linter.name} (${linter.reason})`);
  }

  const skippedLinters = report.linterSelection.filter((entry) => !entry.selected);
  if (skippedLinters.length > 0) {
    lines.push("");
    lines.push("  Skipped Linters:");
    lines.push("");
    for (const linter of skippedLinters) {
      lines.push(`    - ${linter.name} (${linter.reason})`);
    }
  }

  if (report.ignoredFiles.length > 0) {
    lines.push("");
    lines.push("  Ignored Files:");
    lines.push("");
    for (const file of report.ignoredFiles.slice(0, 10)) {
      lines.push(`    - ${file.path} (${file.reason})`);
    }
    if (report.ignoredFiles.length > 10) {
      lines.push(`    ... and ${report.ignoredFiles.length - 10} more`);
    }
  }

  if (report.fileCoverage.coveredFiles.length > 0) {
    lines.push("");
    lines.push("  Covered Files:");
    lines.push("");
    for (const file of report.fileCoverage.coveredFiles.slice(0, 10)) {
      lines.push(`    ✓ ${file.path} -> ${file.linters.join(", ")} (${file.reason})`);
    }
    if (report.fileCoverage.coveredFiles.length > 10) {
      lines.push(`    ... and ${report.fileCoverage.coveredFiles.length - 10} more`);
    }
  }

  if (report.fileCoverage.uncoveredFiles.length > 0) {
    lines.push("");
    lines.push("  Uncovered Files:");
    lines.push("");
    for (const file of report.fileCoverage.uncoveredFiles.slice(0, 10)) {
      lines.push(`    - ${file.path} (${file.reason})`);
    }
    if (report.fileCoverage.uncoveredFiles.length > 10) {
      lines.push(`    ... and ${report.fileCoverage.uncoveredFiles.length - 10} more`);
    }
  }

  if (Object.keys(report.policy.byLinter).length > 0) {
    lines.push("");
    lines.push("  Policy Rules By Linter:");
    lines.push("");
    for (const [linter, count] of Object.entries(report.policy.byLinter)) {
      lines.push(`    ${linter}: ${count}`);
    }
  }

  if (report.nextSteps.length > 0) {
    lines.push("");
    lines.push("  Recommended Next Steps:");
    lines.push("");
    for (const step of report.nextSteps) {
      lines.push(`    - ${step}`);
    }
  }

  lines.push("");
  return lines;
}

export function formatRunDecisionJson(report: RunDecisionReport): string {
  return JSON.stringify(
    {
      schema_version: LINT_JSON_SCHEMA_VERSION,
      kind: "lint_explain_run",
      ...report,
    },
    null,
    2,
  );
}
