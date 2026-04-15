import { describe, expect, it } from "vitest";

// Test API module structure (without making actual network calls)
describe("api module", () => {
  it("should export all API functions", async () => {
    const api = await import("../src/api.js");
    expect(typeof api.login).toBe("function");
    expect(typeof api.signup).toBe("function");
    expect(typeof api.fetchUser).toBe("function");
    expect(typeof api.fetchRepository).toBe("function");
    expect(typeof api.searchRepository).toBe("function");
    expect(typeof api.createRepository).toBe("function");
    expect(typeof api.fetchPolicy).toBe("function");
    expect(typeof api.createCommitAttempt).toBe("function");
    expect(typeof api.postReport).toBe("function");
  });

  it("should handle failed requests gracefully", async () => {
    const api = await import("../src/api.js");
    // Fetch a non-existent user — should not throw, should return error or non-200
    const result = await api.fetchUser("nonexistent_user_xyz_12345", "invalid_token");
    // Should not throw — just return a non-successful result
    expect(result).toBeDefined();
    expect(typeof result.status).toBe("number");
  });
});
