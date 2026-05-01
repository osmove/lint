import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ProjectEntry,
  ProjectRepositoryEntry,
  ProjectsRegistry,
} from "@lint/schemas";
import { ProjectsRegistrySchema } from "@lint/schemas";

// User-level registry of Lint projects, lives at ~/.lint/projects.json.
// Projects mirror Backlog/Twoody/Osmove vocabulary: a project is the work
// container, and it can hold one or more git repositories.

export type RepositoryEntry = ProjectRepositoryEntry & {
  projectId: string;
  projectName: string;
};

const REGISTRY_PATH = path.join(os.homedir(), ".lint", "projects.json");

function emptyRegistry(): ProjectsRegistry {
  return { version: 2, projects: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueId(taken: Iterable<string>, baseName: string): string {
  const safeBase = slugify(baseName) || "project";
  let candidate = safeBase;
  let n = 2;
  const ids = new Set(taken);
  while (ids.has(candidate)) {
    candidate = `${safeBase}-${n++}`;
  }
  return candidate;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRepository(
  raw: Record<string, unknown>,
  fallbackName: string,
  taken: Set<string>,
): ProjectRepositoryEntry | null {
  if (typeof raw.root !== "string") return null;
  const resolved = path.resolve(raw.root);
  const name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : fallbackName;
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? uniqueId(taken, raw.id)
      : uniqueId(taken, name || path.basename(resolved));
  taken.add(id);

  return {
    id,
    name,
    root: resolved,
    addedAt: typeof raw.addedAt === "string" ? raw.addedAt : new Date().toISOString(),
  };
}

function normalizeProject(
  raw: Record<string, unknown>,
  takenProjectIds: Set<string>,
  allowEmpty: boolean,
): ProjectEntry | null {
  const name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Project";
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? uniqueId(takenProjectIds, raw.id)
      : uniqueId(takenProjectIds, name);
  takenProjectIds.add(id);

  const repoIds = new Set<string>();
  const repositories: ProjectRepositoryEntry[] = [];
  const rawRepos = Array.isArray(raw.repositories) ? raw.repositories : [];

  for (const candidate of rawRepos) {
    if (!isRecord(candidate)) continue;
    const repo = normalizeRepository(candidate, name, repoIds);
    if (repo) repositories.push(repo);
  }

  // Version 1 stored one repository directly on the project entry. Treat it
  // as a single-repo project so old registries keep working.
  if (repositories.length === 0 && typeof raw.root === "string") {
    const repo = normalizeRepository(raw, name, repoIds);
    if (repo) repositories.push(repo);
  }

  if (repositories.length === 0 && !allowEmpty) return null;

  const root = typeof raw.root === "string" ? path.resolve(raw.root) : repositories[0]?.root;
  return {
    id,
    name,
    root,
    addedAt: typeof raw.addedAt === "string" ? raw.addedAt : repositories[0]?.addedAt ?? new Date().toISOString(),
    repositories,
  };
}

function normalizeRegistry(raw: unknown): ProjectsRegistry {
  if (!isRecord(raw) || !Array.isArray(raw.projects)) return emptyRegistry();

  const projectIds = new Set<string>();
  const allowEmptyProjects = raw.version === 2;
  const projects = raw.projects
    .filter(isRecord)
    .map((project) => normalizeProject(project, projectIds, allowEmptyProjects))
    .filter((project): project is ProjectEntry => project !== null);

  const parsed = ProjectsRegistrySchema.safeParse({ version: 2, projects });
  return parsed.success ? parsed.data : emptyRegistry();
}

export function readRegistry(): ProjectsRegistry {
  if (!fs.existsSync(REGISTRY_PATH)) return emptyRegistry();
  try {
    return normalizeRegistry(JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")));
  } catch {
    return emptyRegistry();
  }
}

function writeRegistry(reg: ProjectsRegistry): void {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(reg, null, 2)}\n`, "utf-8");
}

export function listProjects(): ProjectEntry[] {
  return readRegistry().projects.slice();
}

export function listRepositories(projectId?: string): RepositoryEntry[] {
  const projects = listProjects().filter((p) => !projectId || p.id === projectId);
  return projects.flatMap((project) =>
    project.repositories.map((repo) => ({
      ...repo,
      projectId: project.id,
      projectName: project.name,
    })),
  );
}

export function findProjectByRoot(root: string): ProjectEntry | undefined {
  const resolved = path.resolve(root);
  return readRegistry().projects.find((p) =>
    p.repositories.some((repo) => path.resolve(repo.root) === resolved),
  );
}

export function findRepositoryByRoot(root: string): RepositoryEntry | undefined {
  const resolved = path.resolve(root);
  return listRepositories().find((repo) => path.resolve(repo.root) === resolved);
}

export function createProject(name: string, options: { root?: string } = {}): ProjectEntry {
  const reg = readRegistry();
  const existing =
    options.root && reg.projects.find((p) => p.repositories.some((repo) => path.resolve(repo.root) === path.resolve(options.root!)));
  if (existing) return existing;

  const id = uniqueId(
    reg.projects.map((p) => p.id),
    name,
  );
  const now = new Date().toISOString();
  const repositories = options.root
    ? [
        {
          id,
          name,
          root: path.resolve(options.root),
          addedAt: now,
        },
      ]
    : [];
  const project: ProjectEntry = {
    id,
    name,
    root: options.root ? path.resolve(options.root) : repositories[0]?.root,
    addedAt: now,
    repositories,
  };
  reg.projects.push(project);
  writeRegistry(reg);
  return project;
}

export function addRepositoryToProject(
  projectId: string,
  root: string,
  displayName?: string,
): ProjectRepositoryEntry | null {
  const reg = readRegistry();
  const project = reg.projects.find((p) => p.id === projectId);
  if (!project) return null;

  const resolved = path.resolve(root);
  const existing = project.repositories.find((repo) => path.resolve(repo.root) === resolved);
  if (existing) return existing;

  const name = displayName ?? path.basename(resolved);
  const repo: ProjectRepositoryEntry = {
    id: uniqueId(
      project.repositories.map((r) => r.id),
      name,
    ),
    name,
    root: resolved,
    addedAt: new Date().toISOString(),
  };
  project.repositories.push(repo);
  project.root ??= repo.root;
  writeRegistry(reg);
  return repo;
}

export function removeRepositoryFromProject(projectId: string, repoId: string): boolean {
  const reg = readRegistry();
  const project = reg.projects.find((p) => p.id === projectId);
  if (!project) return false;

  const before = project.repositories.length;
  project.repositories = project.repositories.filter((repo) => repo.id !== repoId);
  if (project.repositories.length === before) return false;

  project.root = project.repositories[0]?.root;
  if (project.repositories.length === 0) {
    reg.projects = reg.projects.filter((p) => p.id !== projectId);
  }
  writeRegistry(reg);
  return true;
}

// Backward-compatible API for the existing CLI/UI: registering a repo creates
// a single-repo project when needed, and returns the repository entry enriched
// with project identity.
export function registerProject(root: string, displayName?: string): RepositoryEntry {
  const resolved = path.resolve(root);
  const existing = findRepositoryByRoot(resolved);
  if (existing) return existing;

  const project = createProject(displayName ?? path.basename(resolved), { root: resolved });
  const repo = project.repositories[0]!;
  return { ...repo, projectId: project.id, projectName: project.name };
}

export function unregisterProject(id: string): boolean {
  const reg = readRegistry();

  const beforeProjects = reg.projects.length;
  reg.projects = reg.projects.filter((p) => p.id !== id);
  if (reg.projects.length !== beforeProjects) {
    writeRegistry(reg);
    return true;
  }

  for (const project of reg.projects) {
    const beforeRepos = project.repositories.length;
    project.repositories = project.repositories.filter((repo) => repo.id !== id);
    if (project.repositories.length !== beforeRepos) {
      project.root = project.repositories[0]?.root;
      if (project.repositories.length === 0) {
        reg.projects = reg.projects.filter((p) => p.id !== project.id);
      }
      writeRegistry(reg);
      return true;
    }
  }

  return false;
}

export const REGISTRY_FILE_PATH = REGISTRY_PATH;
