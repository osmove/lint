import fs from "node:fs";
import path from "node:path";
import type { FileReport, LintReport, LinterResult, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

export class PrettierLinter extends BaseLinter {
  name = "prettier" as const;
  command = "prettier";
  installCmd = "npm install -g prettier";
  configFileName = ".prettierrc.json";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const config: Record<string, unknown> = {};

    for (const rule of rules.filter((r) => r.linter === "prettier")) {
      if (rule.status === "enabled" && rule.content?.options) {
        Object.assign(config, rule.content.options);
      }
    }

    // Sensible defaults if no rules provided
    if (Object.keys(config).length === 0) {
      Object.assign(config, {
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        trailingComma: "all",
        printWidth: 100,
      });
    }

    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, autofix: boolean): LinterResult {
    if (autofix) {
      try {
        execFile("prettier", ["--config", configPath, "--write", ...files], { silent: true });
      } catch {
        // Prettier may fail on some files, continue
      }
      return { success: true, report: this.emptyReport() };
    }

    // Check mode
    let raw: string;
    try {
      raw = execFile("prettier", ["--config", configPath, "--check", ...files], { silent: true });
      return { success: true, report: this.emptyReport(), raw };
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || "";
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    const lines = raw.split("\n").filter((l) => l.trim());
    const unformatted = lines.filter((l) => l.includes("[warn]") || !l.startsWith("Checking"));

    const fileReports: FileReport[] = unformatted
      .filter((line) => !line.startsWith("[warn]"))
      .map((filePath) => ({
        path: filePath.trim(),
        offenses: [
          {
            rule: "prettier/prettier",
            message: "File is not formatted",
            severity: "warning" as const,
            line: 1,
            column: 1,
            fixable: true,
          },
        ],
      }));

    return this.buildReport(fileReports);
  }
}
