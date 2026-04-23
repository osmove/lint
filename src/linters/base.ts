import chalk from "chalk";
import { SUPPORTED_EXTENSIONS } from "../config.js";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { ensureTmpDir, execFile, filterFilesByExtensions, isCommandAvailable } from "../utils.js";

export abstract class BaseLinter {
  abstract name: string;
  abstract command: string;
  abstract installCmd: string;
  abstract configFileName: string;

  get extensions(): string[] {
    return SUPPORTED_EXTENSIONS[this.name] || [];
  }

  isInstalled(): boolean {
    return isCommandAvailable(this.command);
  }

  install(): void {
    console.log(chalk.cyan(`Installing ${this.name}...`));
    try {
      execFile("sh", ["-lc", this.installCmd]);
      console.log(chalk.green(`${this.name} installed.`));
    } catch (error) {
      console.log(chalk.red(`Failed to install ${this.name}.`), (error as Error).message);
    }
  }

  selectFiles(stagedFiles: string[]): string[] {
    return filterFilesByExtensions(stagedFiles, this.extensions);
  }

  abstract createConfig(rules: PolicyRule[], tmpDir: string): string;
  abstract run(files: string[], configPath: string, autofix: boolean): LinterResult;
  abstract parseOutput(raw: string, files: string[]): LintReport;

  execute(stagedFiles: string[], rules: PolicyRule[], autofix = false): LinterResult | null {
    const files = this.selectFiles(stagedFiles);
    if (files.length === 0) return null;

    if (!this.isInstalled()) {
      console.log(chalk.yellow(`${this.name} is not installed. Skipping.`));
      return null;
    }

    const tmpDir = ensureTmpDir();
    const configPath = this.createConfig(rules, tmpDir);

    try {
      return this.run(files, configPath, autofix);
    } catch (error) {
      console.log(chalk.red(`${this.name} failed:`), (error as Error).message);
      return {
        success: false,
        report: this.emptyReport(),
      };
    }
  }

  protected emptyReport(): LintReport {
    return {
      linter: this.name,
      files: [],
      error_count: 0,
      warning_count: 0,
      fixable_error_count: 0,
      fixable_warning_count: 0,
    };
  }

  protected buildReport(files: FileReport[]): LintReport {
    let errorCount = 0;
    let warningCount = 0;
    let fixableErrorCount = 0;
    let fixableWarningCount = 0;

    for (const file of files) {
      for (const offense of file.offenses) {
        if (offense.severity === "error") {
          errorCount++;
          if (offense.fixable) fixableErrorCount++;
        } else {
          warningCount++;
          if (offense.fixable) fixableWarningCount++;
        }
      }
    }

    return {
      linter: this.name,
      files,
      error_count: errorCount,
      warning_count: warningCount,
      fixable_error_count: fixableErrorCount,
      fixable_warning_count: fixableWarningCount,
    };
  }
}
