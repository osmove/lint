import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { ServerProject } from "../src/project-context.js";

const tempRoots: string[] = [];

function makeWorkspace(): ServerProject {
  const root = mkdtempSync(path.join(tmpdir(), "lint-server-test-"));
  tempRoots.push(root);
  return {
    root,
    name: path.basename(root),
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildApp", () => {
  it("serves health details", async () => {
    const { app } = buildApp({ workspace: makeWorkspace() });

    const response = await app.request("/api/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "lint-server",
      version: "0.1.0",
    });
  });

  it("includes the active workspace in repo listings", async () => {
    const workspace = makeWorkspace();
    const { app } = buildApp({ workspace });

    const response = await app.request("/api/repos");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.repos).toContainEqual(
      expect.objectContaining({
        id: workspace.name,
        name: workspace.name,
        root: workspace.root,
        projectId: workspace.name,
        projectName: workspace.name,
        ephemeral: true,
        health: "unknown",
      }),
    );
  });

  it("exposes project listings with repository children", async () => {
    const workspace = makeWorkspace();
    const { app } = buildApp({ workspace });

    const response = await app.request("/api/projects");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toContainEqual(
      expect.objectContaining({
        id: workspace.name,
        name: workspace.name,
        ephemeral: true,
        repositories: [
          expect.objectContaining({
            id: workspace.name,
            root: workspace.root,
            projectId: workspace.name,
          }),
        ],
      }),
    );
  });
});
