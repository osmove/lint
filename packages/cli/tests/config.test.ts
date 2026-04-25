import { describe, expect, it } from "vitest";
import {
  API_BASE_URL,
  FILE_EXTENSION_TO_LANGUAGE,
  SUPPORTED_EXTENSIONS,
  VERSION,
} from "../src/config.js";

describe("config", () => {
  it("should export a version string", () => {
    // VERSION is replaced at build time by tsup's `define` from package.json.
    // In test mode (vitest) the placeholder is not replaced, so we accept the
    // dev fallback or any valid semver-shaped string.
    expect(typeof VERSION).toBe("string");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/);
  });

  it("should have a valid API base URL", () => {
    expect(API_BASE_URL).toMatch(/^https?:\/\//);
  });

  describe("SUPPORTED_EXTENSIONS", () => {
    it("should have entries for all linters", () => {
      const expectedLinters = [
        "eslint",
        "prettier",
        "rubocop",
        "erblint",
        "brakeman",
        "stylelint",
        "pylint",
        "biome",
        "ruff",
        "oxlint",
      ];
      for (const linter of expectedLinters) {
        expect(SUPPORTED_EXTENSIONS[linter]).toBeDefined();
        expect(SUPPORTED_EXTENSIONS[linter].length).toBeGreaterThan(0);
      }
    });

    it("should have .js in eslint extensions", () => {
      expect(SUPPORTED_EXTENSIONS.eslint).toContain(".js");
      expect(SUPPORTED_EXTENSIONS.eslint).toContain(".ts");
      expect(SUPPORTED_EXTENSIONS.eslint).toContain(".tsx");
    });

    it("should have .py in ruff and pylint extensions", () => {
      expect(SUPPORTED_EXTENSIONS.ruff).toContain(".py");
      expect(SUPPORTED_EXTENSIONS.pylint).toContain(".py");
    });

    it("should have .rb in rubocop extensions", () => {
      expect(SUPPORTED_EXTENSIONS.rubocop).toContain(".rb");
    });

    it("should have .css in stylelint extensions", () => {
      expect(SUPPORTED_EXTENSIONS.stylelint).toContain(".css");
      expect(SUPPORTED_EXTENSIONS.stylelint).toContain(".scss");
    });
  });

  describe("FILE_EXTENSION_TO_LANGUAGE", () => {
    it("should map common extensions to languages", () => {
      expect(FILE_EXTENSION_TO_LANGUAGE[".js"]).toBe("javascript");
      expect(FILE_EXTENSION_TO_LANGUAGE[".ts"]).toBe("typescript");
      expect(FILE_EXTENSION_TO_LANGUAGE[".py"]).toBe("python");
      expect(FILE_EXTENSION_TO_LANGUAGE[".rb"]).toBe("ruby");
      expect(FILE_EXTENSION_TO_LANGUAGE[".css"]).toBe("css");
    });
  });
});
