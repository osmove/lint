import { describe, expect, it } from "vitest";
import { getMachineSummaryExitCode } from "../src/orchestrator.js";

describe("orchestrator", () => {
  describe("getMachineSummaryExitCode", () => {
    it("returns 0 for a healthy fully covered repo", () => {
      expect(
        getMachineSummaryExitCode({
          doctor_status: "healthy",
          run_mode: ".",
          selected_linters: ["biome"],
          missing_selected_linters: [],
          uncovered_file_count: 0,
          ignored_file_count: 0,
          applicable_policy_rule_count: 1,
          next_steps: [],
          actions: [],
        }),
      ).toBe(0);
    });

    it("returns 1 when setup or coverage still needs attention", () => {
      expect(
        getMachineSummaryExitCode({
          doctor_status: "needs_setup",
          run_mode: ".",
          selected_linters: ["biome"],
          missing_selected_linters: ["ruff"],
          uncovered_file_count: 2,
          ignored_file_count: 0,
          applicable_policy_rule_count: 0,
          next_steps: ["Install missing linters"],
          actions: [
            {
              id: "install_missing_linters",
              label: "Install missing linters",
              command: "lint install:missing .",
              reason: "Missing selected linters: ruff",
            },
          ],
        }),
      ).toBe(1);
    });
  });
});
