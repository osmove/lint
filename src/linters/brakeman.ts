import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { exec } from "../utils.js";
import { BaseLinter } from "./base.js";

interface BrakemanWarning {
  warning_type: string;
  message: string;
  file: string;
  line: number;
  confidence: string;
  check_name: string;
}

interface BrakemanOutput {
  warnings: BrakemanWarning[];
  errors: Array<{ error: string; location?: string }>;
  scan_info: { app_path: string };
}

export class BrakemanLinter extends BaseLinter {
  name = "brakeman" as const;
  command = "brakeman";
  installCmd = "gem install brakeman";
  configFileName = ""; // Brakeman doesn't use a config file in the same way

  createConfig(_rules: PolicyRule[], _tmpDir: string): string {
    return ""; // Brakeman scans the whole Rails app
  }

  run(files: string[], _configPath: string, _autofix: boolean): LinterResult {
    const onlyFiles = files.join(",");
    const cmd = `brakeman -f json --no-pager --only-files "${onlyFiles}"`;

    let raw: string;
    try {
      raw = exec(cmd, { silent: true });
    } catch (error) {
      const err = error as { stdout?: string; status?: number };
      if (err.status === 4) {
        // Not a Rails app
        return { success: true, report: this.emptyReport() };
      }
      raw = err.stdout || '{"warnings":[],"errors":[]}';
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let output: BrakemanOutput;
    try {
      output = JSON.parse(raw);
    } catch {
      return this.emptyReport();
    }

    // Group warnings by file
    const fileMap = new Map<string, Offense[]>();

    for (const warning of output.warnings) {
      const offenses = fileMap.get(warning.file) || [];
      offenses.push({
        rule: warning.check_name || warning.warning_type,
        message: `[${warning.warning_type}] ${warning.message} (confidence: ${warning.confidence})`,
        severity: warning.confidence === "High" ? "error" : "warning",
        line: warning.line || 1,
        column: 1,
      });
      fileMap.set(warning.file, offenses);
    }

    for (const error of output.errors || []) {
      const file = error.location || "unknown";
      const offenses = fileMap.get(file) || [];
      offenses.push({
        rule: "brakeman/error",
        message: error.error,
        severity: "error",
        line: 1,
        column: 1,
      });
      fileMap.set(file, offenses);
    }

    const fileReports: FileReport[] = Array.from(fileMap.entries()).map(([filePath, offenses]) => ({
      path: filePath,
      offenses,
    }));

    return this.buildReport(fileReports);
  }
}
