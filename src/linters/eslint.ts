import fs from "node:fs";
import path from "node:path";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  fix?: unknown;
}

interface ESLintFileResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

export class ESLintLinter extends BaseLinter {
  name = "eslint" as const;
  command = "eslint";
  installCmd = "npm install -g eslint";
  configFileName = "eslintrc.json";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const eslintPolicyRules = rules.filter((r) => r.linter === "eslint");
    if (eslintPolicyRules.length === 0) return "";

    const config: Record<string, unknown> = {
      env: { es2022: true, node: true, browser: true },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      rules: {} as Record<string, unknown>,
    };

    const eslintRules: Record<string, unknown> = {};
    for (const rule of eslintPolicyRules) {
      if (rule.status === "enabled") {
        eslintRules[rule.slug] = rule.severity === "error" ? "error" : "warn";
      } else {
        eslintRules[rule.slug] = "off";
      }
    }
    config.rules = eslintRules;

    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, autofix: boolean): LinterResult {
    let raw: string;
    try {
      raw = execFile(
        "eslint",
        [
          ...(configPath ? ["--config", configPath] : []),
          "--format",
          "json",
          ...(autofix ? ["--fix"] : []),
          ...files,
        ],
        { silent: true },
      );
    } catch (error) {
      // ESLint exits with code 1 when there are lint errors — that's expected
      raw = (error as { stdout?: string }).stdout || "[]";
    }

    const report = this.parseOutput(raw, files);
    return {
      success: report.error_count === 0,
      report,
      raw,
    };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let results: ESLintFileResult[];
    try {
      results = JSON.parse(raw);
    } catch {
      return this.emptyReport();
    }

    const fileReports: FileReport[] = results
      .filter((r) => r.messages.length > 0)
      .map((result) => ({
        path: result.filePath,
        offenses: result.messages.map(
          (msg): Offense => ({
            rule: msg.ruleId || "unknown",
            message: msg.message,
            severity: msg.severity === 2 ? "error" : "warning",
            line: msg.line,
            column: msg.column,
            fixable: !!msg.fix,
          }),
        ),
      }));

    return this.buildReport(fileReports);
  }
}
