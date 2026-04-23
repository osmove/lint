import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BiomeLinter } from "../src/linters/biome.js";
import { BrakemanLinter } from "../src/linters/brakeman.js";
import { ErbLintLinter } from "../src/linters/erblint.js";
import { ESLintLinter } from "../src/linters/eslint.js";
import { OxlintLinter } from "../src/linters/oxlint.js";
import { PrettierLinter } from "../src/linters/prettier.js";
import { PylintLinter } from "../src/linters/pylint.js";
import { RuboCopLinter } from "../src/linters/rubocop.js";
import { RuffLinter } from "../src/linters/ruff.js";
import { StylelintLinter } from "../src/linters/stylelint.js";

describe("ESLintLinter", () => {
  const linter = new ESLintLinter();

  it("should have correct name and command", () => {
    expect(linter.name).toBe("eslint");
    expect(linter.command).toBe("eslint");
  });

  it("should select JS/TS files", () => {
    const files = ["a.js", "b.ts", "c.py", "d.tsx", "e.rb"];
    expect(linter.selectFiles(files)).toEqual(["a.js", "b.ts", "d.tsx"]);
  });

  it("should parse ESLint JSON output", () => {
    const raw = JSON.stringify([
      {
        filePath: "/test/file.js",
        messages: [
          { ruleId: "no-unused-vars", severity: 2, message: "x is unused", line: 5, column: 3 },
          {
            ruleId: "semi",
            severity: 1,
            message: "Missing semicolon",
            line: 10,
            column: 1,
            fix: {},
          },
        ],
        errorCount: 1,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 1,
      },
    ]);

    const report = linter.parseOutput(raw, []);
    expect(report.linter).toBe("eslint");
    expect(report.files).toHaveLength(1);
    expect(report.files[0].offenses).toHaveLength(2);
    expect(report.files[0].offenses[0].severity).toBe("error");
    expect(report.files[0].offenses[1].severity).toBe("warning");
    expect(report.files[0].offenses[1].fixable).toBe(true);
    expect(report.error_count).toBe(1);
    expect(report.warning_count).toBe(1);
  });

  it("should handle invalid JSON gracefully", () => {
    const report = linter.parseOutput("not json", []);
    expect(report.error_count).toBe(0);
    expect(report.files).toEqual([]);
  });
});

describe("PrettierLinter", () => {
  const linter = new PrettierLinter();

  it("should have correct name", () => {
    expect(linter.name).toBe("prettier");
  });

  it("should select formatting-relevant files", () => {
    const files = ["a.js", "b.css", "c.py", "d.json", "e.md"];
    const selected = linter.selectFiles(files);
    expect(selected).toContain("a.js");
    expect(selected).toContain("b.css");
    expect(selected).toContain("d.json");
    expect(selected).toContain("e.md");
    expect(selected).not.toContain("c.py");
  });
});

describe("RuboCopLinter", () => {
  const linter = new RuboCopLinter();

  it("should select Ruby files", () => {
    const files = ["app.rb", "Rakefile.rake", "script.py", "spec.gemspec"];
    expect(linter.selectFiles(files)).toEqual(["app.rb", "Rakefile.rake", "spec.gemspec"]);
  });

  it("should parse RuboCop JSON output", () => {
    const raw = JSON.stringify({
      files: [
        {
          path: "app.rb",
          offenses: [
            {
              severity: "warning",
              message: "Use snake_case",
              cop_name: "Naming/MethodName",
              correctable: true,
              location: { start_line: 3, start_column: 5 },
            },
          ],
        },
      ],
      summary: { offense_count: 1 },
    });

    const report = linter.parseOutput(raw, []);
    expect(report.files).toHaveLength(1);
    expect(report.warning_count).toBe(1);
    expect(report.files[0].offenses[0].fixable).toBe(true);
  });
});

describe("BiomeLinter", () => {
  const linter = new BiomeLinter();

  it("should have correct name", () => {
    expect(linter.name).toBe("biome");
  });

  it("should select JS/TS/JSON/CSS files", () => {
    const files = ["a.js", "b.ts", "c.json", "d.css", "e.py", "f.rb"];
    const selected = linter.selectFiles(files);
    expect(selected).toEqual(["a.js", "b.ts", "c.json", "d.css"]);
  });

  it("should handle empty diagnostics", () => {
    const report = linter.parseOutput('{"diagnostics":[]}', []);
    expect(report.error_count).toBe(0);
    expect(report.files).toEqual([]);
  });

  it("should derive line and column from biome source spans", () => {
    const raw = JSON.stringify({
      diagnostics: [
        {
          category: "lint/suspicious/noDebugger",
          severity: "error",
          description: "Unexpected debugger statement.",
          message: { content: "Unexpected debugger statement." },
          location: {
            path: { file: "src/app.ts" },
            span: { start: 13, end: 21 },
            sourceCode: "const x = 1;\ndebugger;\n",
          },
        },
      ],
    });

    const report = linter.parseOutput(raw, []);
    expect(report.files[0].offenses[0].line).toBe(2);
    expect(report.files[0].offenses[0].column).toBe(1);
  });

  it("should defer to project config when no biome policy rules are provided", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-biome-"));
    expect(linter.createConfig([], tmpDir)).toBe("");
  });
});

describe("RuffLinter", () => {
  const linter = new RuffLinter();

  it("should select Python files", () => {
    const files = ["main.py", "types.pyi", "script.js", "app.rb"];
    expect(linter.selectFiles(files)).toEqual(["main.py", "types.pyi"]);
  });

  it("should parse Ruff JSON output", () => {
    const raw = JSON.stringify([
      {
        code: "F401",
        message: "os imported but unused",
        filename: "main.py",
        location: { row: 1, column: 1 },
        end_location: { row: 1, column: 10 },
        fix: { message: "Remove unused import", applicability: "safe" },
      },
    ]);

    const report = linter.parseOutput(raw, []);
    expect(report.files).toHaveLength(1);
    expect(report.files[0].offenses[0].rule).toBe("F401");
    expect(report.files[0].offenses[0].fixable).toBe(true);
  });

  it("should defer to project config when no ruff policy rules are provided", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-ruff-"));
    expect(linter.createConfig([], tmpDir)).toBe("");
  });
});

describe("OxlintLinter", () => {
  const linter = new OxlintLinter();

  it("should select JS/TS files", () => {
    const files = ["a.js", "b.mjs", "c.cjs", "d.py"];
    const selected = linter.selectFiles(files);
    expect(selected).toEqual(["a.js", "b.mjs", "c.cjs"]);
  });

  it("should derive line and column from oxlint label offsets", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-oxlint-"));
    const filePath = path.join(tmpDir, "app.js");
    fs.writeFileSync(filePath, "const x = 1;\nconsole.log(x)\n", "utf-8");

    const raw = JSON.stringify([
      {
        message: "Unexpected console statement",
        code: { code: "no-console" },
        labels: [{ span: { offset: 13, length: 7 } }],
        severity: "warning",
        filename: filePath,
      },
    ]);

    const report = linter.parseOutput(raw, []);
    expect(report.files[0].offenses[0].line).toBe(2);
    expect(report.files[0].offenses[0].column).toBe(1);
  });
});

describe("StylelintLinter", () => {
  const linter = new StylelintLinter();

  it("should select CSS files", () => {
    const files = ["a.css", "b.scss", "c.less", "d.js"];
    expect(linter.selectFiles(files)).toEqual(["a.css", "b.scss", "c.less"]);
  });

  it("should defer to project config when no stylelint policy rules are provided", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-stylelint-"));
    expect(linter.createConfig([], tmpDir)).toBe("");
  });
});

describe("PylintLinter", () => {
  const linter = new PylintLinter();

  it("should select Python files", () => {
    const files = ["main.py", "app.js", "test.rb"];
    expect(linter.selectFiles(files)).toEqual(["main.py"]);
  });
});

describe("BrakemanLinter", () => {
  const linter = new BrakemanLinter();

  it("should select Ruby files", () => {
    const files = ["app.rb", "index.js", "main.py"];
    expect(linter.selectFiles(files)).toEqual(["app.rb"]);
  });

  it("should parse Brakeman JSON output", () => {
    const raw = JSON.stringify({
      warnings: [
        {
          warning_type: "SQL Injection",
          message: "Possible SQL injection",
          file: "app/models/user.rb",
          line: 15,
          confidence: "High",
          check_name: "SQL",
        },
      ],
      errors: [],
      scan_info: { app_path: "/app" },
    });

    const report = linter.parseOutput(raw, []);
    expect(report.files).toHaveLength(1);
    expect(report.error_count).toBe(1); // High confidence = error
  });
});

describe("ErbLintLinter", () => {
  const linter = new ErbLintLinter();

  it("should select ERB files", () => {
    const files = ["view.erb", "index.html", "app.rb"];
    expect(linter.selectFiles(files)).toEqual(["view.erb"]);
  });
});
