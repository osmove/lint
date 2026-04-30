import path from "node:path";
import { findGitRoot } from "@lint/git";

export interface ServerProject {
  root: string;
  name: string;
}

export function resolveProject(workspace?: string): ServerProject {
  const root = workspace
    ? path.resolve(workspace)
    : findGitRoot() || process.cwd();
  return {
    root,
    name: path.basename(root),
  };
}
