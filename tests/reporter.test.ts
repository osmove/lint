import { describe, expect, it, vi } from "vitest";
import { printReport, printSummaryTable } from "../src/reporter.js";
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
});
