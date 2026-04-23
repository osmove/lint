import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDir,
  exec,
  filterFilesByExtensions,
  findGitRoot,
  formatDuration,
  getFileExtension,
  getRelevantSource,
  isCommandAvailable,
} from "../src/utils.js";

describe("exec", () => {
  it("should execute a command and return trimmed output", () => {
    const result = exec("echo hello");
    expect(result).toBe("hello");
  });

  it("should return stdout even on non-zero exit", () => {
    // grep with no match returns exit code 1
    expect(() => exec("false")).toThrow();
  });

  it("should respect the silent option", () => {
    const result = exec("echo test", { silent: true });
    expect(result).toBe("test");
  });
});

describe("isCommandAvailable", () => {
  it("should return true for existing commands", () => {
    expect(isCommandAvailable("node")).toBe(true);
  });

  it("should return false for non-existing commands", () => {
    expect(isCommandAvailable("nonexistent_command_xyz")).toBe(false);
  });
});

describe("findGitRoot", () => {
  it("should find the git root directory", () => {
    const root = findGitRoot();
    expect(root).toBeTruthy();
    if (root) {
      expect(fs.existsSync(path.join(root, ".git"))).toBe(true);
    }
  });
});

describe("getFileExtension", () => {
  it("should return the file extension", () => {
    expect(getFileExtension("test.js")).toBe(".js");
    expect(getFileExtension("path/to/file.tsx")).toBe(".tsx");
    expect(getFileExtension("file.test.ts")).toBe(".ts");
    expect(getFileExtension("Gemfile")).toBe("");
  });
});

describe("filterFilesByExtensions", () => {
  it("should filter files by extensions", () => {
    const files = ["a.js", "b.ts", "c.py", "d.rb", "e.css"];
    expect(filterFilesByExtensions(files, [".js", ".ts"])).toEqual(["a.js", "b.ts"]);
    expect(filterFilesByExtensions(files, [".py"])).toEqual(["c.py"]);
    expect(filterFilesByExtensions(files, [".go"])).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(2500)).toBe("2.5s");
  });

  it("should format minutes", () => {
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

describe("ensureDir", () => {
  const testDir = path.join("/tmp", `lint-test-${Date.now()}`);

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // cleanup
    }
  });

  it("should create a directory if it does not exist", () => {
    ensureDir(testDir);
    expect(fs.existsSync(testDir)).toBe(true);
  });

  it("should not throw if directory already exists", () => {
    ensureDir(testDir);
    expect(() => ensureDir(testDir)).not.toThrow();
  });
});

describe("getRelevantSource", () => {
  it("should return empty array for non-existent file", () => {
    const result = getRelevantSource("/nonexistent/file.js", 5);
    expect(result).toEqual([]);
  });
});
