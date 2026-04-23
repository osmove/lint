import fs from "node:fs";
import path from "node:path";
import type { FileReport, LintReport, LinterResult, Offense, PolicyRule } from "../types.js";
import { execFile } from "../utils.js";
import { BaseLinter } from "./base.js";

interface BiomeDiagnostic {
  category: string;
  severity: string;
  description: string;
  message: { content: string };
  location: {
    path: { file: string };
    span: { start: number; end: number };
    sourceCode?: string;
  };
  advices?: { advices: Array<{ log: [string, string] }> };
}

function offsetToLineColumn(source: string | undefined, offset: number): { line: number; column: number } {
  if (!source || offset <= 0) {
    return { line: 1, column: 1 };
  }

  const clampedOffset = Math.min(offset, source.length);
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
}

export class BiomeLinter extends BaseLinter {
  name = "biome" as const;
  command = "biome";
  installCmd = "npm install -g @biomejs/biome";
  configFileName = "biome.json";

  createConfig(rules: PolicyRule[], tmpDir: string): string {
    const biomeRules = rules.filter((r) => r.linter === "biome");
    if (biomeRules.length === 0) return "";

    const config: Record<string, unknown> = {
      $schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
      linter: {
        enabled: true,
        rules: { recommended: true },
      },
      formatter: {
        enabled: true,
        indentStyle: "space",
        indentWidth: 2,
      },
    };

    // Apply policy rules if any
    const linterRules: Record<string, Record<string, string>> = {};
    for (const rule of biomeRules) {
      const [group, name] = rule.slug.includes("/")
        ? rule.slug.split("/")
        : ["recommended", rule.slug];
      if (!linterRules[group]) linterRules[group] = {};
      linterRules[group][name] = rule.status === "enabled" ? rule.severity : "off";
    }

    if (Object.keys(linterRules).length > 0) {
      (config.linter as Record<string, unknown>).rules = linterRules;
    }

    const configPath = path.join(tmpDir, this.configFileName);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return configPath;
  }

  run(files: string[], configPath: string, autofix: boolean): LinterResult {
    let raw: string;
    try {
      raw = execFile(
        "biome",
        [
          ...(autofix ? ["check", "--write"] : ["lint"]),
          ...(configPath ? [`--config-path=${path.dirname(configPath)}`] : []),
          "--reporter=json",
          ...files,
        ],
        { silent: true },
      );
    } catch (error) {
      raw = (error as { stdout?: string }).stdout || '{"diagnostics":[]}';
    }

    const report = this.parseOutput(raw, files);
    return { success: report.error_count === 0, report, raw };
  }

  parseOutput(raw: string, _files: string[]): LintReport {
    let output: { diagnostics: BiomeDiagnostic[] };
    try {
      output = JSON.parse(raw);
    } catch {
      return this.emptyReport();
    }

    const fileMap = new Map<string, Offense[]>();

    for (const diag of output.diagnostics || []) {
      const file = diag.location?.path?.file || "unknown";
      const offenses = fileMap.get(file) || [];
      const position = offsetToLineColumn(diag.location?.sourceCode, diag.location?.span?.start || 0);
      offenses.push({
        rule: diag.category || "biome",
        message: diag.message?.content || diag.description || "Unknown issue",
        severity: diag.severity === "error" ? "error" : "warning",
        line: position.line,
        column: position.column,
        source: diag.location?.sourceCode,
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
