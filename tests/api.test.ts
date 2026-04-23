import { afterEach, describe, expect, it, vi } from "vitest";

describe("api module", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("should return parsed JSON data for successful requests", async () => {
    const api = await import("../src/api.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "jimmy", email: "jimmy@example.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.fetchUser("jimmy", "token-123");
    expect(result).toEqual({
      data: { username: "jimmy", email: "jimmy@example.com" },
      status: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should handle failed requests gracefully without real network access", async () => {
    const api = await import("../src/api.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.fetchUser("jimmy", "invalid_token");
    expect(result).toEqual({
      error: "Unauthorized",
      status: 401,
    });
  });

  it("should convert fetch exceptions into API errors", async () => {
    const api = await import("../src/api.js");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await api.fetchUser("jimmy", "token-123");
    expect(result).toEqual({
      error: "network down",
      status: 0,
    });
  });
});
