import { describe, expect, it } from "vitest";
import { getMachineSummaryExitCode } from "../src/orchestrator.js";

describe("orchestrator", () => {
  describe("getMachineSummaryExitCode", () => {
    it("returns 0 for a healthy fully covered repo", () => {
      expect(
        getMachineSummaryExitCode({
          status: "ready",
          doctor_status: "healthy",
          run_mode: ".",
          selected_linters: ["biome"],
          missing_selected_linters: [],
          uncovered_file_count: 0,
          ignored_file_count: 0,
          applicable_policy_rule_count: 1,
          blocking_reasons: [],
          warning_reasons: [],
          signals: {
            needs_setup: false,
            has_missing_selected_linters: false,
            has_uncovered_files: false,
            has_policy_scope_gap: false,
            is_actionable: false,
          },
          next_steps: [],
          actions: [],
          primary_action: null,
        }),
      ).toBe(0);
    });

    it("returns 1 when setup or coverage still needs attention", () => {
      expect(
        getMachineSummaryExitCode({
          status: "action_required",
          doctor_status: "needs_setup",
          run_mode: ".",
          selected_linters: ["biome"],
          missing_selected_linters: ["ruff"],
          uncovered_file_count: 2,
          ignored_file_count: 0,
          applicable_policy_rule_count: 0,
          blocking_reasons: ["needs_setup", "missing_selected_linters", "uncovered_files"],
          warning_reasons: [],
          signals: {
            needs_setup: true,
            has_missing_selected_linters: true,
            has_uncovered_files: true,
            has_policy_scope_gap: false,
            is_actionable: true,
          },
          next_steps: ["Install missing linters"],
          actions: [
            {
              id: "install_missing_linters",
              label: "Install missing linters",
              command: "lint install:missing .",
              reason: "Missing selected linters: ruff",
            },
          ],
          primary_action: {
            id: "install_missing_linters",
            label: "Install missing linters",
            command: "lint install:missing .",
            reason: "Missing selected linters: ruff",
          },
        }),
      ).toBe(1);
    });
  });
});
