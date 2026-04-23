import fs from "node:fs";
import path from "node:path";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

interface OxlintDiagnostic {
  message: string;
  code: { code: string; explanation?: string };
  labels: Array<{ span: { offset: number; length: number }; message?: string }>;
  severity: string;
  related?: unknown[];
  filename?: string;
}

function offsetToLineColumn(filePath: string, offset: number): { line: number; column: number } {
  try {
    const source = fs.readFileSync(filePath, "utf-8");
    const clampedOffset = Math.min(Math.max(offset, 0), source.length);
    let line = 1;
    let column = 1;

    for (let i = 0; i < clampedOffset; i++) {
      if (source[i] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
    }

    return { line, column };
  } catch {
    return { line: 1, column: 1 };
  }
}

export class OxlintLinter extends BaseLinter {
  name = "oxlint" as const;
  command = "oxlint";
  installCmd = "npm install -g oxlint";
  configFileName = ".oxlintrc.json";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const oxlintRulesList = rules.filter((r) => r.linter === "oxlint");
    if (oxlintRulesList.length === 0) return "";

    const config: Record<string, unknown> = {
      rules: {} as Record<string, string>,
    };

    const oxlintRules: Record<string, string> = {};
    for (const rule of oxlintRulesList) {
      oxlintRules[rule.slug] = rule.status === "enabled" ? rule.severity : "off";
    }

    config.rules = oxlintRules;
    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, _autofix: boolean): LinterResult {
    let raw: string;
    try {
      raw = execFile("oxlint", [...(configPath ? [`--config=${configPath}`] : []), "--format=json", ...files], {
        silent: true,
      });
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || "[]";
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let diagnostics: OxlintDiagnostic[];
    try {
      diagnostics = JSON.parse(raw);
      if (!Array.isArray(diagnostics)) diagnostics = [];
    } catch {
      return this.emptyReport();
    }

    const fileMap = new Map<string, Offense[]>();

    for (const diag of diagnostics) {
      const file = diag.filename || "unknown";
      const offenses = fileMap.get(file) || [];
      const offset = diag.labels[0]?.span?.offset || 0;
      const position = offsetToLineColumn(file, offset);
      offenses.push({
        rule: diag.code?.code || "oxlint",
        message: diag.message,
        severity: diag.severity === "error" ? "error" : "warning",
        line: position.line,
        column: position.column,
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
