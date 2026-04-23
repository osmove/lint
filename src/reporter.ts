import chalk from "chalk";
import Table from "cli-table3";
import type { LintReport } from "./types.js";

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

  return JSON.stringify(
    {
      success: totalErrors === 0,
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
