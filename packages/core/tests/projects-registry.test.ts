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
    expect(reg.listRepositories()).toEqual([]);
  });

  it("registerProject creates a one-repo project and returns the repo entry", async () => {
    const reg = await loadRegistry();
    const entry = reg.registerProject("/some/path/to/my-repo");
    expect(entry.id).toBe("my-repo");
    expect(entry.root).toBe("/some/path/to/my-repo");
    expect(entry.projectId).toBe("my-repo");
    expect(entry.projectName).toBe("my-repo");
    expect(entry.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fs.existsSync(path.join(tmpHome, ".lint", "projects.json"))).toBe(true);
    expect(reg.listProjects()).toHaveLength(1);
    expect(reg.listProjects()[0]).toEqual(
      expect.objectContaining({
        id: "my-repo",
        name: "my-repo",
        repositories: [expect.objectContaining({ id: "my-repo", root: "/some/path/to/my-repo" })],
      }),
    );
  });

  it("registerProject is idempotent on the same root", async () => {
    const reg = await loadRegistry();
    const a = reg.registerProject("/repo");
    const b = reg.registerProject("/repo");
    expect(a.id).toBe(b.id);
    expect(reg.listProjects()).toHaveLength(1);
    expect(reg.listRepositories()).toHaveLength(1);
  });

  it("appends a -2 suffix on basename collisions across different roots", async () => {
    const reg = await loadRegistry();
    const a = reg.registerProject("/foo/lint-cli");
    const b = reg.registerProject("/bar/lint-cli");
    expect(a.id).toBe("lint-cli");
    expect(b.id).toBe("lint-cli-2");
    expect(a.projectId).toBe("lint-cli");
    expect(b.projectId).toBe("lint-cli-2");
  });

  it("respects an explicit displayName as the id seed", async () => {
    const reg = await loadRegistry();
    const entry = reg.registerProject("/x/y/something", "my-special-name");
    expect(entry.id).toBe("my-special-name");
    expect(entry.name).toBe("my-special-name");
    expect(entry.projectId).toBe("my-special-name");
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

  it("supports multi-repository projects", async () => {
    const reg = await loadRegistry();
    const project = reg.createProject("Osmove", { root: "/work/osmove/lint-cli" });
    const repo = reg.addRepositoryToProject(project.id, "/work/osmove/lint-backend", "lint-backend");

    expect(repo?.id).toBe("lint-backend");
    expect(reg.listProjects()).toEqual([
      expect.objectContaining({
        id: "osmove",
        name: "Osmove",
        repositories: [
          expect.objectContaining({ id: "osmove", root: "/work/osmove/lint-cli" }),
          expect.objectContaining({ id: "lint-backend", root: "/work/osmove/lint-backend" }),
        ],
      }),
    ]);
    expect(reg.listRepositories(project.id).map((r) => r.projectName)).toEqual(["Osmove", "Osmove"]);
    expect(reg.findRepositoryByRoot("/work/osmove/lint-backend")?.projectId).toBe("osmove");
  });

  it("removes a repository without removing the project when siblings remain", async () => {
    const reg = await loadRegistry();
    const project = reg.createProject("Twoody", { root: "/work/twoody/app" });
    reg.addRepositoryToProject(project.id, "/work/twoody/backend", "backend");

    expect(reg.removeRepositoryFromProject(project.id, "backend")).toBe(true);
    expect(reg.listProjects()).toHaveLength(1);
    expect(reg.listProjects()[0]?.repositories).toHaveLength(1);
  });

  it("preserves empty version 2 projects", async () => {
    const reg = await loadRegistry();
    const project = reg.createProject("Osmove");
    expect(project.repositories).toEqual([]);
    expect(reg.listProjects()[0]).toEqual(expect.objectContaining({ id: "osmove", repositories: [] }));
  });

  it("migrates version 1 registries into single-repo projects", async () => {
    fs.mkdirSync(path.join(tmpHome, ".lint"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".lint", "projects.json"),
      JSON.stringify({
        version: 1,
        projects: [{ id: "legacy", name: "Legacy", root: "/legacy/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
      }),
      "utf-8",
    );

    const reg = await loadRegistry();
    expect(reg.readRegistry()).toEqual({
      version: 2,
      projects: [
        {
          id: "legacy",
          name: "Legacy",
          root: "/legacy/repo",
          addedAt: "2026-01-01T00:00:00.000Z",
          repositories: [{ id: "legacy", name: "Legacy", root: "/legacy/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
        },
      ],
    });
  });

  it("recovers an empty registry when the JSON is malformed", async () => {
    fs.mkdirSync(path.join(tmpHome, ".lint"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".lint", "projects.json"), "{not json", "utf-8");
    const reg = await loadRegistry();
    expect(reg.listProjects()).toEqual([]);
  });
});
