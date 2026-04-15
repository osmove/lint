import chalk from "chalk";
import Table from "cli-table3";
import type { LintReport } from "./types.js";

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
