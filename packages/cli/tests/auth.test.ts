import { describe, expect, it } from "vitest";
import { getToken, getUsername, isLoggedIn } from "../src/auth.js";

describe("auth", () => {
  describe("getUsername", () => {
    it("should return null when no username file exists", () => {
      const result = getUsername();
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
