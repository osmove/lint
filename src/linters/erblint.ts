import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { exec } from "../utils.js";
import { BaseLinter } from "./base.js";

export class ErbLintLinter extends BaseLinter {
  name = "erblint" as const;
  command = "erblint";
  installCmd = "gem install erb_lint";
  configFileName = ".erb-lint.yml";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const config: Record<string, unknown> = {
      linters: {
        Rubocop: { enabled: true },
      },
    };

    for (const rule of rules.filter((r) => r.linter === "erblint")) {
      if (!config.linters) config.linters = {};
      (config.linters as Record<string, unknown>)[rule.slug] = {
        enabled: rule.status === "enabled",
      };
    }

    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, yaml.dump(config), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, _autofix: boolean): LinterResult {
    const cmd = `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 erblint --config ${configPath} --format json ${files.join(" ")}`;

    let raw: string;
    try {
      raw = exec(cmd, { silent: true });
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || '{"files":[],"summary":{"offenses":0}}';
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, files: string[]): LintReport {
    // erblint JSON output varies by version, try structured first
    try {
      const output = JSON.parse(raw);
      if (output.files) {
        const fileReports: FileReport[] = output.files
          .filter((f: { offenses: unknown[] }) => f.offenses?.length > 0)
          .map(
            (f: {
              path: string;
              offenses: Array<{
                linter: string;
                message: string;
                location: { start_line: number; start_column: number };
              }>;
            }) => ({
              path: f.path,
              offenses: f.offenses.map(
                (o): Offense => ({
                  rule: o.linter || "erblint",
                  message: o.message,
                  severity: "warning" as const,
                  line: o.location?.start_line || 1,
                  column: o.location?.start_column || 1,
                }),
              ),
            }),
          );
        return this.buildReport(fileReports);
      }
    } catch {
      // Fall through to text parsing
    }

    // Parse text output
    const lines = raw.split("\n").filter((l) => l.trim());
    const offenses: Offense[] = [];

    for (const line of lines) {
      const match = line.match(/^(.+):(\d+):(\d+):\s*(.+)$/);
      if (match) {
        offenses.push({
          rule: "erblint",
          message: match[4],
          severity: "warning",
          line: Number.parseInt(match[2], 10),
          column: Number.parseInt(match[3], 10),
        });
      }
    }

    if (offenses.length === 0) return this.emptyReport();

    return this.buildReport([{ path: files[0] || "unknown", offenses }]);
  }
}
