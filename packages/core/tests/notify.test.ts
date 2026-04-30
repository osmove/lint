import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireNotifyWebhooks, __test__ } from "../src/notify.js";

describe("resolveTemplate", () => {
  it("interpolates ${VAR} from env", () => {
    expect(__test__.resolveTemplate("https://${HOST}/x", { HOST: "h.com" })).toBe(
      "https://h.com/x",
    );
  });

  it("leaves a literal URL alone", () => {
    expect(__test__.resolveTemplate("https://hooks.slack.com/x")).toBe(
      "https://hooks.slack.com/x",
    );
  });

  it("collapses missing vars to empty so the URL becomes obviously broken", () => {
    expect(__test__.resolveTemplate("https://${UNSET}/x", {})).toBe("https:///x");
  });
});

describe("shouldFire", () => {
  it("defaults to firing on failed only", () => {
    expect(__test__.shouldFire({}, "failed")).toBe(true);
    expect(__test__.shouldFire({}, "passed")).toBe(false);
  });
  it("respects an explicit on list", () => {
    expect(__test__.shouldFire({ on: ["passed"] }, "failed")).toBe(false);
    expect(__test__.shouldFire({ on: ["passed", "failed"] }, "passed")).toBe(true);
  });
});

describe("buildText", () => {
  it("formats a fail line", () => {
    const text = __test__.buildText({
      status: "failed",
      totalErrors: 3,
      totalWarnings: 1,
      repoRoot: "/path/to/lint-cli",
    });
    expect(text).toBe("[lint FAIL] lint-cli — 3 errors, 1 warning");
  });

  it("formats a pass line + ref suffix", () => {
    const text = __test__.buildText({
      status: "passed",
      totalErrors: 0,
      totalWarnings: 0,
      repoRoot: "/path/to/myrepo",
      ref: "main@abc123",
    });
    expect(text).toBe("[lint PASS] myrepo · main@abc123 — 0 errors, 0 warnings");
  });
});

describe("fireNotifyWebhooks", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires nothing when there's no notify block", async () => {
    const r = await fireNotifyWebhooks({
      status: "failed",
      totalErrors: 1,
      totalWarnings: 0,
      repoRoot: "/r",
    });
    expect(r).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fires nothing on a passed run by default", async () => {
    const r = await fireNotifyWebhooks({
      status: "passed",
      totalErrors: 0,
      totalWarnings: 0,
      repoRoot: "/r",
      notify: { slack: "https://x" },
    });
    expect(r).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("posts to slack on failed", async () => {
    const r = await fireNotifyWebhooks({
      status: "failed",
      totalErrors: 1,
      totalWarnings: 2,
      repoRoot: "/r/lint-cli",
      notify: { slack: "https://hooks.slack.com/x" },
    });
    expect(r.slack).toBe(true);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe("https://hooks.slack.com/x");
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body.text).toContain("FAIL");
    expect(body.text).toContain("lint-cli");
    expect(body.text).toContain("1 error");
  });

  it("posts to discord on configured outcome with content payload", async () => {
    const r = await fireNotifyWebhooks({
      status: "passed",
      totalErrors: 0,
      totalWarnings: 0,
      repoRoot: "/r/x",
      notify: { on: ["passed"], discord: "https://discord.com/api/webhooks/y" },
    });
    expect(r.discord).toBe(true);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body.content).toContain("PASS");
  });

  it("resolves ${VAR} URLs from the env at fire time", async () => {
    const original = process.env.MY_HOOK;
    process.env.MY_HOOK = "https://hooks.slack.com/from-env";
    try {
      await fireNotifyWebhooks({
        status: "failed",
        totalErrors: 1,
        totalWarnings: 0,
        repoRoot: "/r",
        notify: { slack: "${MY_HOOK}" },
      });
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
        "https://hooks.slack.com/from-env",
      );
    } finally {
      if (original === undefined) delete process.env.MY_HOOK;
      else process.env.MY_HOOK = original;
    }
  });
});
