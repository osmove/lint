import { describe, expect, it, vi } from "vitest";
import { formatJsonReport, printReport, printSummaryTable } from "../src/reporter.js";
import type { LintReport } from "../src/types.js";

describe("reporter", () => {
  const mockReport: LintReport = {
    linter: "eslint",
    files: [
      {
        path: "src/test.js",
        offenses: [
          {
            rule: "no-unused-vars",
            message: "Variable 'x' is defined but never used",
            severity: "error",
            line: 5,
            column: 3,
            fixable: false,
          },
          {
            rule: "semi",
            message: "Missing semicolon",
            severity: "warning",
            line: 10,
            column: 15,
            fixable: true,
          },
        ],
      },
    ],
    error_count: 1,
    warning_count: 1,
    fixable_error_count: 0,
    fixable_warning_count: 1,
  };

  const emptyReport: LintReport = {
    linter: "prettier",
    files: [],
    error_count: 0,
    warning_count: 0,
    fixable_error_count: 0,
    fixable_warning_count: 0,
  };

  describe("printReport", () => {
    it("should not throw with valid reports", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => printReport([mockReport])).not.toThrow();
      logSpy.mockRestore();
    });

    it("should not throw with empty reports", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => printReport([emptyReport])).not.toThrow();
      logSpy.mockRestore();
    });

    it("should handle truncation", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => printReport([mockReport], true)).not.toThrow();
      logSpy.mockRestore();
    });

    it("should handle multiple reports", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => printReport([mockReport, emptyReport])).not.toThrow();
      logSpy.mockRestore();
    });
  });

  describe("printSummaryTable", () => {
    it("should not throw with valid reports", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => printSummaryTable([mockReport])).not.toThrow();
      logSpy.mockRestore();
    });

    it("should not print table for empty reports", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      printSummaryTable([emptyReport]);
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe("formatJsonReport", () => {
    it("should include run metadata for CI and orchestration", () => {
      const parsed = JSON.parse(
        formatJsonReport([mockReport], {
          duration: 123,
          dryRun: true,
          fix: false,
          cwd: "/tmp/project",
          mode: "staged files",
          fileCount: 1,
          linterNames: ["eslint"],
          policyRuleCount: 2,
        }),
      );

      expect(parsed.success).toBe(false);
      expect(parsed.summary.duration_ms).toBe(123);
      expect(parsed.run).toEqual({
        cwd: "/tmp/project",
        mode: "staged files",
        file_count: 1,
        linters: ["eslint"],
        policy_rule_count: 2,
      });
    });

    it("should preserve a message for empty or skipped runs", () => {
      const parsed = JSON.parse(
        formatJsonReport([], {
          duration: 5,
          cwd: "/tmp/project",
          mode: "staged files",
          fileCount: 0,
          linterNames: [],
          policyRuleCount: 0,
          message: "No files to lint",
        }),
      );

      expect(parsed.message).toBe("No files to lint");
      expect(parsed.run.file_count).toBe(0);
      expect(parsed.linters).toEqual([]);
    });
  });
});
