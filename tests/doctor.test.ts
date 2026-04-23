import { describe, expect, it } from "vitest";
import { formatDoctorReport, type DoctorReport } from "../src/doctor.js";

describe("doctor", () => {
  it("formats a full doctor report", () => {
    const report: DoctorReport = {
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
      },
      linters: [
        { name: "biome", installed: true, enabled: true },
        { name: "eslint", installed: false, enabled: false },
      ],
      hooks: [
        { name: "pre-commit", exists: true, managed: true, hookPath: "/tmp/project/.git/hooks/pre-commit" },
        { name: "post-commit", exists: false, managed: false, hookPath: "/tmp/project/.git/hooks/post-commit" },
      ],
    };

    const lines = formatDoctorReport(report);
    expect(lines.join("\n")).toContain("Lint Doctor");
    expect(lines.join("\n")).toContain("✓ Git: /tmp/project");
    expect(lines.join("\n")).toContain("✓ Branch: main (clean)");
    expect(lines.join("\n")).toContain("✓ Config: .lint/config (cloud)");
    expect(lines.join("\n")).toContain("✓ Auth: jimmy");
    expect(lines.join("\n")).toContain("✓ biome: installed");
    expect(lines.join("\n")).toContain("✗ eslint: not installed (disabled in .lintrc.yaml)");
    expect(lines.join("\n")).toContain("✓ pre-commit");
    expect(lines.join("\n")).toContain("- post-commit (not installed)");
  });

  it("formats a minimal offline report", () => {
    const report: DoctorReport = {
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
      },
      linters: [],
      hooks: [],
    };

    const lines = formatDoctorReport(report);
    expect(lines.join("\n")).toContain("✗ Not a git repository");
    expect(lines.join("\n")).toContain("✗ No .lint/config");
    expect(lines.join("\n")).toContain("- Not logged in (offline mode)");
  });
});
