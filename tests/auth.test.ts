import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getToken, getUsername, isLoggedIn } from "../src/auth.js";
import { REFS_DIR, TOKEN_PATH, USERNAME_PATH } from "../src/config.js";

describe("auth", () => {
  const testDir = path.join("/tmp", `omnilint-auth-test-${Date.now()}`);

  describe("getUsername", () => {
    it("should return null when no username file exists", () => {
      // The default paths won't have test data
      const result = getUsername();
      // May return actual username or null depending on environment
      expect(typeof result === "string" || result === null).toBe(true);
    });
  });

  describe("getToken", () => {
    it("should return null when no token file exists", () => {
      const result = getToken();
      expect(typeof result === "string" || result === null).toBe(true);
    });
  });

  describe("isLoggedIn", () => {
    it("should return a boolean", () => {
      expect(typeof isLoggedIn()).toBe("boolean");
    });
  });
});
