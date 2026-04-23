import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

interface RubocopOffense {
  severity: string;
  message: string;
  cop_name: string;
  correctable: boolean;
  location: { start_line: number; start_column: number };
}

interface RubocopFileResult {
  path: string;
  offenses: RubocopOffense[];
}

interface RubocopOutput {
  files: RubocopFileResult[];
  summary: { offense_count: number };
}

export class RuboCopLinter extends BaseLinter {
  name = "rubocop" as const;
  command = "rubocop";
  installCmd = "gem install rubocop";
  configFileName = ".rubocop.yml";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const config: Record<string, unknown> = {
      AllCops: { NewCops: "enable", SuggestExtensions: false },
    };

    for (const rule of rules.filter((r) => r.linter === "rubocop")) {
      config[rule.slug] = {
        Enabled: rule.status === "enabled",
        Severity: rule.severity === "error" ? "error" : "warning",
      };
    }

    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, yaml.dump(config), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, autofix: boolean): LinterResult {
    let raw: string;
    try {
      raw = execFile(
        "rubocop",
        [
          "--config",
          configPath,
          "--format",
          "json",
          ...(autofix ? ["--autocorrect"] : []),
          ...files,
        ],
        { silent: true },
      );
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || '{"files":[],"summary":{"offense_count":0}}';
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let output: RubocopOutput;
    try {
      output = JSON.parse(raw);
    } catch {
      return this.emptyReport();
    }

    const fileReports: FileReport[] = output.files
      .filter((f) => f.offenses.length > 0)
      .map((file) => ({
        path: file.path,
        offenses: file.offenses.map(
          (o): Offense => ({
            rule: o.cop_name,
            message: o.message,
            severity: o.severity === "error" || o.severity === "fatal" ? "error" : "warning",
            line: o.location.start_line,
            column: o.location.start_column,
            fixable: o.correctable,
          }),
        ),
      }));

    return this.buildReport(fileReports);
  }
}
