import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectGitHubContext,
  postCheckRun,
  reportsToAnnotations,
} from "../src/github-checks.js";

describe("detectGitHubContext", () => {
  const baseEnv = {
    GITHUB_ACTIONS: "true",
    GITHUB_TOKEN: "ghs_xxx",
    GITHUB_REPOSITORY: "osmove/lint",
    GITHUB_SHA: "abcdef1234567890",
  } as NodeJS.ProcessEnv;

  it("returns null when GITHUB_ACTIONS is not set", () => {
    expect(detectGitHubContext({})).toBeNull();
  });

  it("returns null when any required var is missing", () => {
    expect(detectGitHubContext({ ...baseEnv, GITHUB_TOKEN: undefined })).toBeNull();
    expect(detectGitHubContext({ ...baseEnv, GITHUB_REPOSITORY: undefined })).toBeNull();
    expect(detectGitHubContext({ ...baseEnv, GITHUB_SHA: undefined })).toBeNull();
  });

  it("rejects an invalid repository slug", () => {
    expect(detectGitHubContext({ ...baseEnv, GITHUB_REPOSITORY: "no-slash" })).toBeNull();
    expect(detectGitHubContext({ ...baseEnv, GITHUB_REPOSITORY: "/leading-slash" })).toBeNull();
  });

  it("splits owner/repo correctly", () => {
    const ctx = detectGitHubContext(baseEnv);
    expect(ctx).toEqual({
      token: "ghs_xxx",
      owner: "osmove",
      repo: "lint",
      sha: "abcdef1234567890",
    });
  });
});

describe("reportsToAnnotations", () => {
  it("flattens reports into Check API annotations", () => {
    const ann = reportsToAnnotations([
      {
        linter: "eslint",
        files: [
          {
            path: "src/a.ts",
            offenses: [
              {
                rule: "no-unused-vars",
                message: "x is defined but never used",
                severity: "error",
                line: 5,
                column: 7,
              },
            ],
          },
        ],
        error_count: 1,
        warning_count: 0,
        fixable_error_count: 0,
        fixable_warning_count: 0,
      },
    ]);
    expect(ann).toHaveLength(1);
    expect(ann[0]).toMatchObject({
      path: "src/a.ts",
      start_line: 5,
      end_line: 5,
      annotation_level: "failure",
      title: "eslint · no-unused-vars",
      message: "x is defined but never used",
    });
  });

  it("respects the cap so we don't blow past the API limit", () => {
    const offenses = Array.from({ length: 75 }, (_, i) => ({
      rule: "r",
      message: "m",
      severity: "warning" as const,
      line: i + 1,
      column: 1,
    }));
    const ann = reportsToAnnotations(
      [
        {
          linter: "eslint",
          files: [{ path: "src/a.ts", offenses }],
          error_count: 0,
          warning_count: 75,
          fixable_error_count: 0,
          fixable_warning_count: 0,
        },
      ],
      50,
    );
    expect(ann).toHaveLength(50);
    expect(ann[0]?.annotation_level).toBe("warning");
  });
});

describe("postCheckRun", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the checks endpoint with the expected body shape", async () => {
    const mock = (globalThis.fetch as ReturnType<typeof vi.fn>);
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 42, html_url: "https://github.com/x/y/runs/42" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await postCheckRun({
      token: "tkn",
      owner: "osmove",
      repo: "lint",
      sha: "abc",
      title: "All clean",
      summary: "ran 3 linters across 12 files",
      conclusion: "success",
    });
    expect(result).toEqual({ id: 42, html_url: "https://github.com/x/y/runs/42" });
    const call = mock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.github.com/repos/osmove/lint/check-runs");
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body).toMatchObject({
      name: "Lint",
      head_sha: "abc",
      status: "completed",
      conclusion: "success",
      output: { title: "All clean", summary: "ran 3 linters across 12 files" },
    });
  });

  it("returns null when the API responds with an error", async () => {
    const mock = (globalThis.fetch as ReturnType<typeof vi.fn>);
    mock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const result = await postCheckRun({
      token: "tkn",
      owner: "x",
      repo: "y",
      sha: "abc",
      title: "t",
      summary: "s",
      conclusion: "success",
    });
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const mock = (globalThis.fetch as ReturnType<typeof vi.fn>);
    mock.mockRejectedValueOnce(new Error("network down"));
    const result = await postCheckRun({
      token: "tkn",
      owner: "x",
      repo: "y",
      sha: "abc",
      title: "t",
      summary: "s",
      conclusion: "success",
    });
    expect(result).toBeNull();
  });
});
