import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock os.homedir() so the registry lands in a tmp dir per test.
let tmpHome: string;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => tmpHome,
    default: { ...actual, homedir: () => tmpHome },
  };
});

// Late-import so the mock is in place before the module under test
// captures the homedir value.
async function loadRegistry() {
  vi.resetModules();
  return import("../src/projects-registry.js");
}

describe("projects-registry", () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "lint-registry-"));
  });
  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("starts empty when no file exists", async () => {
    const reg = await loadRegistry();
    expect(reg.listProjects()).toEqual([]);
  });

  it("registerProject creates the file and returns the entry", async () => {
    const reg = await loadRegistry();
    const entry = reg.registerProject("/some/path/to/my-repo");
    expect(entry.id).toBe("my-repo");
    expect(entry.root).toBe("/some/path/to/my-repo");
    expect(entry.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fs.existsSync(path.join(tmpHome, ".lint", "projects.json"))).toBe(true);
    expect(reg.listProjects()).toHaveLength(1);
  });

  it("registerProject is idempotent on the same root", async () => {
    const reg = await loadRegistry();
    const a = reg.registerProject("/repo");
    const b = reg.registerProject("/repo");
    expect(a.id).toBe(b.id);
    expect(reg.listProjects()).toHaveLength(1);
  });

  it("appends a -2 suffix on basename collisions across different roots", async () => {
    const reg = await loadRegistry();
    const a = reg.registerProject("/foo/lint-cli");
    const b = reg.registerProject("/bar/lint-cli");
    expect(a.id).toBe("lint-cli");
    expect(b.id).toBe("lint-cli-2");
  });

  it("respects an explicit displayName as the id seed", async () => {
    const reg = await loadRegistry();
    const entry = reg.registerProject("/x/y/something", "my-special-name");
    expect(entry.id).toBe("my-special-name");
    expect(entry.name).toBe("my-special-name");
  });

  it("unregisterProject removes by id and returns true; false on miss", async () => {
    const reg = await loadRegistry();
    reg.registerProject("/repo");
    expect(reg.unregisterProject("repo")).toBe(true);
    expect(reg.unregisterProject("repo")).toBe(false);
    expect(reg.listProjects()).toEqual([]);
  });

  it("findProjectByRoot resolves identical paths", async () => {
    const reg = await loadRegistry();
    reg.registerProject("/abs/path");
    expect(reg.findProjectByRoot("/abs/path")?.id).toBe("path");
    expect(reg.findProjectByRoot("/other")).toBeUndefined();
  });

  it("recovers an empty registry when the JSON is malformed", async () => {
    fs.mkdirSync(path.join(tmpHome, ".lint"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".lint", "projects.json"), "{not json", "utf-8");
    const reg = await loadRegistry();
    expect(reg.listProjects()).toEqual([]);
  });
});
