import fs from "node:fs";
import path from "node:path";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

interface PylintMessage {
  type: string;
  module: string;
  obj: string;
  line: number;
  column: number;
  path: string;
  symbol: string;
  message: string;
  "message-id": string;
}

export class PylintLinter extends BaseLinter {
  name = "pylint" as const;
  command = "pylint";
  installCmd = "pip install pylint";
  configFileName = ".pylintrc";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const pylintRules = rules.filter((r) => r.linter === "pylint");
    if (pylintRules.length === 0) return "";

    const sections: Record<string, Record<string, string>> = {
      MAIN: {},
      BASIC: {},
      FORMAT: { "max-line-length": "120" },
      SIMILARITIES: { "min-similarity-lines": "6" },
      MESSAGES_CONTROL: {},
    };

    const disabled: string[] = [];
    const enabled: string[] = [];

    for (const rule of pylintRules) {
      if (rule.status === "enabled") {
        enabled.push(rule.slug);
      } else {
        disabled.push(rule.slug);
      }
    }

    if (disabled.length) sections.MESSAGES_CONTROL.disable = disabled.join(",");
    if (enabled.length) sections.MESSAGES_CONTROL.enable = enabled.join(",");

    let content = "";
    for (const [section, values] of Object.entries(sections)) {
      content += `[${section}]\n`;
      for (const [key, value] of Object.entries(values)) {
        content += `${key}=${value}\n`;
      }
      content += "\n";
    }

    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, content, "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, _autofix: boolean): LinterResult {
    let raw: string;
    try {
      raw = execFile(
        "pylint",
        [...(configPath ? [`--rcfile=${configPath}`] : []), "--output-format=json", ...files],
        { silent: true },
      );
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || "[]";
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let messages: PylintMessage[];
    try {
      messages = JSON.parse(raw);
    } catch {
      return this.emptyReport();
    }

    // Group by file
    const fileMap = new Map<string, Offense[]>();

    for (const msg of messages) {
      const offenses = fileMap.get(msg.path) || [];
      offenses.push({
        rule: `${msg.symbol} (${msg["message-id"]})`,
        message: msg.message,
        severity: msg.type === "error" || msg.type === "fatal" ? "error" : "warning",
        line: msg.line,
        column: msg.column,
      });
      fileMap.set(msg.path, offenses);
    }

    const fileReports: FileReport[] = Array.from(fileMap.entries()).map(([filePath, offenses]) => ({
      path: filePath,
      offenses,
    }));

    return this.buildReport(fileReports);
  }
}
