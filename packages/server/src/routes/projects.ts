import path from "node:path";
import { Hono } from "hono";
import {
  addRepositoryToProject,
  createProject,
  listProjects,
  removeRepositoryFromProject,
  type Run,
} from "@lint/core";
import type { ProjectEntry, ProjectRepositoryEntry } from "@lint/schemas";
import type { ServerProject } from "../project-context.js";
import { readRepoHealth } from "./repos.js";

interface ProjectRepoView extends ProjectRepositoryEntry {
  projectId: string;
  projectName: string;
  ephemeral: boolean;
  health: "passed" | "failed" | "unknown";
  latestRun: Run | null;
  summary: { total: number; passed: number; failed: number; running: number };
}

interface ProjectView {
  id: string;
  name: string;
  root?: string;
  addedAt: string | null;
  ephemeral: boolean;
  repositories: ProjectRepoView[];
}

function repoView(project: ProjectEntry, repo: ProjectRepositoryEntry, ephemeral = false): ProjectRepoView {
  return {
    ...repo,
    projectId: project.id,
    projectName: project.name,
    ephemeral,
    ...readRepoHealth(repo.root),
  };
}

function projectView(project: ProjectEntry, ephemeral = false): ProjectView {
  return {
    id: project.id,
    name: project.name,
    root: project.root,
    addedAt: ephemeral ? null : project.addedAt,
    ephemeral,
    repositories: project.repositories.map((repo) => repoView(project, repo, ephemeral)),
  };
}

function workspaceProject(workspace: ServerProject): ProjectEntry {
  return {
    id: workspace.name,
    name: workspace.name,
    root: workspace.root,
    addedAt: new Date().toISOString(),
    repositories: [
      {
        id: workspace.name,
        name: workspace.name,
        root: workspace.root,
        addedAt: new Date().toISOString(),
      },
    ],
  };
}

function allProjectsWithWorkspace(workspace: ServerProject): ProjectView[] {
  const registered = listProjects();
  const views = registered.map((project) => projectView(project));
  const workspaceRoot = path.resolve(workspace.root);
  const hasWorkspace = registered.some((project) =>
    project.repositories.some((repo) => path.resolve(repo.root) === workspaceRoot),
  );
  if (!hasWorkspace) views.push(projectView(workspaceProject(workspace), true));
  return views;
}

export function projectsRouter(workspace: ServerProject): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json({ projects: allProjectsWithWorkspace(workspace) }));

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; root?: string };
    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "missing 'name' (string)" }, 400);
    }
    const project = createProject(body.name, typeof body.root === "string" ? { root: body.root } : {});
    return c.json(projectView(project), 201);
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const project = allProjectsWithWorkspace(workspace).find((p) => p.id === id);
    if (!project) return c.json({ error: "not found" }, 404);
    return c.json(project);
  });

  app.post("/:id/repos", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; name?: string };
    if (!body.path || typeof body.path !== "string") {
      return c.json({ error: "missing 'path' (string)" }, 400);
    }
    const repo = addRepositoryToProject(id, body.path, body.name);
    if (!repo) return c.json({ error: "not found" }, 404);
    const project = listProjects().find((p) => p.id === id);
    if (!project) return c.json({ error: "not found" }, 404);
    return c.json(repoView(project, repo), 201);
  });

  app.delete("/:id/repos/:repoId", (c) => {
    const removed = removeRepositoryFromProject(c.req.param("id"), c.req.param("repoId"));
    if (!removed) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
