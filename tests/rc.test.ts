import { describe, expect, it } from "vitest";
import {
  autoResolveConflicts,
  buildRecommendedRC,
  filterIgnoredFiles,
  formatRC,
  generateDefaultRC,
  resolveEnabledLinters,
  shouldIgnoreFile,
} from "../src/rc.js";

describe("autoResolveConflicts", () => {
  it("should disable eslint when biome is available", () => {
    const result = autoResolveConflicts(["biome", "eslint", "ruff"]);
    expect(result).toContain("biome");
    expect(result).toContain("ruff");
    expect(result).not.toContain("eslint");
  });

  it("should disable prettier when biome is available", () => {
    const result = autoResolveConflicts(["biome", "prettier"]);
    expect(result).toContain("biome");
    expect(result).not.toContain("prettier");
  });

  it("should disable oxlint when biome is available", () => {
    const result = autoResolveConflicts(["biome", "oxlint"]);
    expect(result).toContain("biome");
    expect(result).not.toContain("oxlint");
  });

  it("should disable pylint when ruff is available", () => {
    const result = autoResolveConflicts(["ruff", "pylint"]);
    expect(result).toContain("ruff");
    expect(result).not.toContain("pylint");
  });

  it("should keep eslint if biome is not available", () => {
    const result = autoResolveConflicts(["eslint", "prettier"]);
    expect(result).toContain("eslint");
    expect(result).toContain("prettier");
  });

  it("should keep all non-conflicting linters", () => {
    const result = autoResolveConflicts(["biome", "ruff", "rubocop", "stylelint"]);
    expect(result).toEqual(["biome", "ruff", "rubocop", "stylelint"]);
  });
});

describe("resolveEnabledLinters", () => {
  it("should use explicit enabled list", () => {
    const result = resolveEnabledLinters({ linters: { enabled: ["eslint", "prettier"] } }, [
      "eslint",
      "prettier",
      "biome",
    ]);
    expect(result).toEqual(["eslint", "prettier"]);
  });

  it("should exclude disabled linters", () => {
    const result = resolveEnabledLinters({ linters: { disabled: ["eslint"] } }, [
      "eslint",
      "prettier",
      "biome",
    ]);
    expect(result).not.toContain("eslint");
    expect(result).toContain("prettier");
    expect(result).toContain("biome");
  });

  it("should auto-resolve conflicts when no config", () => {
    const result = resolveEnabledLinters({}, ["biome", "eslint", "ruff", "pylint"]);
    expect(result).toContain("biome");
    expect(result).not.toContain("eslint");
    expect(result).toContain("ruff");
    expect(result).not.toContain("pylint");
  });
});

describe("shouldIgnoreFile", () => {
  it("should match exact glob patterns", () => {
    expect(shouldIgnoreFile("node_modules/foo.js", ["node_modules/**"])).toBe(true);
    expect(shouldIgnoreFile("src/index.ts", ["node_modules/**"])).toBe(false);
  });

  it("should match wildcard patterns", () => {
    expect(shouldIgnoreFile("src/test.test.ts", ["**/*.test.ts"])).toBe(true);
    expect(shouldIgnoreFile("tests/unit/foo.test.ts", ["**/*.test.ts"])).toBe(true);
    expect(shouldIgnoreFile("src/index.ts", ["**/*.test.ts"])).toBe(false);
  });

  it("should match dist directory", () => {
    expect(shouldIgnoreFile("dist/index.js", ["dist/**"])).toBe(true);
  });
});

describe("filterIgnoredFiles", () => {
  it("should remove ignored files", () => {
    const files = ["src/index.ts", "dist/index.js", "node_modules/foo/bar.js", "src/app.ts"];
    const result = filterIgnoredFiles(files, ["dist/**", "node_modules/**"]);
    expect(result).toEqual(["src/index.ts", "src/app.ts"]);
  });

  it("should return all files when no patterns", () => {
    const files = ["a.js", "b.ts"];
    expect(filterIgnoredFiles(files, [])).toEqual(files);
  });
});

describe("generateDefaultRC", () => {
  it("should generate valid RC with enabled linters", () => {
    const rc = generateDefaultRC(["biome", "ruff"]);
    expect(rc.linters?.enabled).toEqual(["biome", "ruff"]);
    expect(rc.ignore).toContain("node_modules/**");
    expect(rc.fix?.enabled).toBe(true);
    expect(rc.hooks?.timeout).toBe(60);
  });
});

describe("buildRecommendedRC", () => {
  it("should preserve custom settings while updating defaults", () => {
    const rc = buildRecommendedRC(
      {
        ignore: ["custom/**"],
        fix: { enabled: false, strategy: "parallel" },
        hooks: { timeout: 30, skip_env: "CUSTOM_SKIP" },
        output: { format: "json", quiet: true },
        rules: { biome: { semi: "always" } },
      },
      ["biome", "ruff"],
    );

    expect(rc.linters?.enabled).toEqual(["biome", "ruff"]);
    expect(rc.ignore).toContain("custom/**");
    expect(rc.ignore).toContain("node_modules/**");
    expect(rc.fix).toEqual({ enabled: false, strategy: "parallel" });
    expect(rc.hooks).toEqual({ timeout: 30, skip_env: "CUSTOM_SKIP" });
    expect(rc.output).toEqual({ format: "json", quiet: true });
    expect(rc.rules).toEqual({ biome: { semi: "always" } });
  });
});

describe("formatRC", () => {
  it("should serialize rc as yaml", () => {
    const output = formatRC(generateDefaultRC(["biome"]));
    expect(output).toContain("linters:");
    expect(output).toContain("- biome");
  });
});
