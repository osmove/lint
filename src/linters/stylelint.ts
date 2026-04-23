import fs from "node:fs";
import path from "node:path";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

interface StylelintResult {
  source: string;
  warnings: Array<{
    line: number;
    column: number;
    rule: string;
    severity: string;
    text: string;
  }>;
}

export class StylelintLinter extends BaseLinter {
  name = "stylelint" as const;
  command = "stylelint";
  installCmd = "npm install -g stylelint";
  configFileName = ".stylelintrc.json";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const config: Record<string, unknown> = { rules: {} };
    const stylelintRules: Record<string, unknown> = {};

    for (const rule of rules.filter((r) => r.linter === "stylelint")) {
      if (rule.status === "enabled") {
        stylelintRules[rule.slug] = [true, { severity: rule.severity }];
      } else {
        stylelintRules[rule.slug] = null;
      }
    }

    config.rules = stylelintRules;
    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, autofix: boolean): LinterResult {
    let raw: string;
    try {
      raw = execFile(
        "stylelint",
        ["--config", configPath, "-f", "json", ...(autofix ? ["--fix"] : []), ...files],
        { silent: true },
      );
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || "[]";
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let results: StylelintResult[];
    try {
      results = JSON.parse(raw);
    } catch {
      return this.emptyReport();
    }

    const fileReports: FileReport[] = results
      .filter((r) => r.warnings.length > 0)
      .map((result) => ({
        path: result.source,
        offenses: result.warnings.map(
          (w): Offense => ({
            rule: w.rule,
            message: w.text,
            severity: w.severity === "error" ? "error" : "warning",
            line: w.line,
            column: w.column,
          }),
        ),
      }));

    return this.buildReport(fileReports);
  }
}
