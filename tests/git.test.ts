import { describe, expect, it } from "vitest";
import {
  getCurrentBranch,
  getCurrentSha,
  getStagedDiff,
  getStagedFilePaths,
  getStagedFiles,
} from "../src/git.js";

describe("git operations", () => {
  describe("getStagedFiles", () => {
    it("should return an array", () => {
      const files = getStagedFiles();
      expect(Array.isArray(files)).toBe(true);
    });

    it("should return objects with path and status", () => {
      const files = getStagedFiles();
      for (const file of files) {
        expect(file).toHaveProperty("path");
        expect(file).toHaveProperty("status");
        expect(["added", "modified", "deleted", "renamed"]).toContain(file.status);
      }
    });
  });

  describe("getStagedFilePaths", () => {
    it("should return an array of strings", () => {
      const paths = getStagedFilePaths();
      expect(Array.isArray(paths)).toBe(true);
      for (const p of paths) {
        expect(typeof p).toBe("string");
      }
    });

    it("should exclude deleted files by default", () => {
      const withDeleted = getStagedFilePaths(false);
      const withoutDeleted = getStagedFilePaths(true);
      expect(withoutDeleted.length).toBeLessThanOrEqual(withDeleted.length);
    });
  });

  describe("getCurrentSha", () => {
    it("should return a git SHA or 'unknown'", () => {
      const sha = getCurrentSha();
      expect(typeof sha).toBe("string");
      expect(sha.length).toBeGreaterThan(0);
      // Should be a hex string or 'unknown'
      expect(sha === "unknown" || /^[a-f0-9]+$/.test(sha)).toBe(true);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return a branch name or 'unknown'", () => {
      const branch = getCurrentBranch();
      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe("getStagedDiff", () => {
    it("should return a string", () => {
      const diff = getStagedDiff();
      expect(typeof diff).toBe("string");
    });
  });
});
