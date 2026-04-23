import { describe, expect, it } from "vitest";
import { formatDoctorReport, type DoctorReport } from "../src/doctor.js";

describe("doctor", () => {
  it("formats a full doctor report", () => {
    const report: DoctorReport = {
      status: "healthy",
      git: {
        root: "/tmp/project",
        branch: "main",
        dirty: false,
      },
      config: {
        initialized: true,
        mode: "cloud",
        rcFile: "/tmp/project/.lintrc.yaml",
        loggedIn: true,
        username: "jimmy",
        hasLintConfig: true,
      },
      project: {
        languages: [
          {
            name: "JavaScript/TypeScript",
            reason: "package.json",
            suggestedLinters: ["biome"],
          },
        ],
        frameworks: ["Next.js"],
        packageManagers: ["npm"],
        suggestedLinters: ["biome"],
        hasHusky: true,
        hasLefthook: false,
      },
      linters: [
        { name: "biome", installed: true, enabled: true, selected: true, source: "auto" },
        { name: "eslint", installed: false, enabled: false, selected: false, source: "auto" },
      ],
      hooks: [
        { name: "pre-commit", exists: true, managed: true, hookPath: "/tmp/project/.git/hooks/pre-commit" },
        { name: "post-commit", exists: false, managed: false, hookPath: "/tmp/project/.git/hooks/post-commit" },
      ],
      summary: {
        installedLinters: 1,
        enabledLinters: 1,
        selectedLinters: 1,
        missingSelectedLinters: [],
        managedHooks: 1,
      },
    };

    const lines = formatDoctorReport(report);
    expect(lines.join("\n")).toContain("Lint Doctor");
    expect(lines.join("\n")).toContain("Status: healthy");
    expect(lines.join("\n")).toContain("✓ Git: /tmp/project");
    expect(lines.join("\n")).toContain("✓ Branch: main (clean)");
    expect(lines.join("\n")).toContain("✓ Config: .lint/config (cloud)");
    expect(lines.join("\n")).toContain("✓ Auth: jimmy");
    expect(lines.join("\n")).toContain("✓ JavaScript/TypeScript (package.json) -> biome");
    expect(lines.join("\n")).toContain("Frameworks: Next.js");
    expect(lines.join("\n")).toContain("Hook managers: husky");
    expect(lines.join("\n")).toContain("✓ biome: installed [selected]");
    expect(lines.join("\n")).toContain("✗ eslint: not installed (auto-disabled)");
    expect(lines.join("\n")).toContain("✓ pre-commit");
    expect(lines.join("\n")).toContain("- post-commit (not installed)");
  });

  it("formats a minimal offline report", () => {
    const report: DoctorReport = {
      status: "needs_setup",
      git: {
        root: null,
        branch: null,
        dirty: null,
      },
      config: {
        initialized: false,
        mode: null,
        rcFile: null,
        loggedIn: false,
        username: null,
        hasLintConfig: false,
      },
      project: {
        languages: [],
        frameworks: [],
        packageManagers: [],
        suggestedLinters: [],
        hasHusky: false,
        hasLefthook: false,
      },
      linters: [],
      hooks: [],
      summary: {
        installedLinters: 0,
        enabledLinters: 0,
        selectedLinters: 0,
        missingSelectedLinters: [],
        managedHooks: 0,
      },
    };

    const lines = formatDoctorReport(report);
    expect(lines.join("\n")).toContain("Status: needs_setup");
    expect(lines.join("\n")).toContain("✗ Not a git repository");
    expect(lines.join("\n")).toContain("✗ No .lint/config");
    expect(lines.join("\n")).toContain("- Not logged in (offline mode)");
    expect(lines.join("\n")).toContain("- No languages detected");
  });

  it("formats missing selected linters in the summary", () => {
    const report: DoctorReport = {
      status: "needs_setup",
      git: {
        root: "/tmp/project",
        branch: "main",
        dirty: true,
      },
      config: {
        initialized: true,
        mode: "offline",
        rcFile: "/tmp/project/.lintrc.yaml",
        loggedIn: false,
        username: null,
        hasLintConfig: true,
      },
      project: {
        languages: [],
        frameworks: [],
        packageManagers: [],
        suggestedLinters: [],
        hasHusky: false,
        hasLefthook: false,
      },
      linters: [
        { name: "ruff", installed: false, enabled: true, selected: false, source: "rc" },
      ],
      hooks: [],
      summary: {
        installedLinters: 0,
        enabledLinters: 1,
        selectedLinters: 0,
        missingSelectedLinters: ["ruff"],
        managedHooks: 0,
      },
    };

    const lines = formatDoctorReport(report);
    expect(lines.join("\n")).toContain("Missing selected linters: ruff");
  });
});
