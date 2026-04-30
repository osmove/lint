import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// User-level registry of Lint projects, lives at ~/.lint/projects.json.
// Same convention as ~/.gitconfig, ~/.npm/, etc — single JSON file the
// CLI and the desktop both read so a user has one consolidated list of
// repos they've linted, not a per-tool fragmented view.
//
// Schema is versioned to make future migrations possible without
// breaking older clients reading the file.

export interface ProjectEntry {
  id: string;
  name: string;
  root: string;
  addedAt: string;
}

export interface ProjectsRegistry {
  version: 1;
  projects: ProjectEntry[];
}

const REGISTRY_PATH = path.join(os.homedir(), ".lint", "projects.json");

function emptyRegistry(): ProjectsRegistry {
  return { version: 1, projects: [] };
}

export function readRegistry(): ProjectsRegistry {
  if (!fs.existsSync(REGISTRY_PATH)) return emptyRegistry();
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")) as ProjectsRegistry;
    if (data.version !== 1 || !Array.isArray(data.projects)) return emptyRegistry();
    return data;
  } catch {
    return emptyRegistry();
  }
}

function writeRegistry(reg: ProjectsRegistry): void {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(reg, null, 2)}\n`, "utf-8");
}

function uniqueId(reg: ProjectsRegistry, baseName: string): string {
  let candidate = baseName;
  let n = 2;
  const taken = new Set(reg.projects.map((p) => p.id));
  while (taken.has(candidate)) {
    candidate = `${baseName}-${n++}`;
  }
  return candidate;
}

export function listProjects(): ProjectEntry[] {
  return readRegistry().projects.slice();
}

export function findProjectByRoot(root: string): ProjectEntry | undefined {
  const resolved = path.resolve(root);
  return readRegistry().projects.find((p) => path.resolve(p.root) === resolved);
}

// Idempotent: if a project with the same root is already registered,
// return the existing entry rather than duplicating.
export function registerProject(root: string, displayName?: string): ProjectEntry {
  const reg = readRegistry();
  const resolved = path.resolve(root);
  const existing = reg.projects.find((p) => path.resolve(p.root) === resolved);
  if (existing) return existing;

  const baseName = displayName ?? path.basename(resolved);
  const entry: ProjectEntry = {
    id: uniqueId(reg, baseName),
    name: baseName,
    root: resolved,
    addedAt: new Date().toISOString(),
  };
  reg.projects.push(entry);
  writeRegistry(reg);
  return entry;
}

export function unregisterProject(id: string): boolean {
  const reg = readRegistry();
  const before = reg.projects.length;
  reg.projects = reg.projects.filter((p) => p.id !== id);
  if (reg.projects.length === before) return false;
  writeRegistry(reg);
  return true;
}

export const REGISTRY_FILE_PATH = REGISTRY_PATH;
