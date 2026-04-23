import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkLinterInstallation, detectProject, getAllSuggestedLinters } from "../src/detect.js";

const tempDirs: string[] = [];

function createProject(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-detect-"));
  tempDirs.push(dir);
  for (const file of files) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "", "utf-8");
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("detectProject", () => {
  it("should detect the current project as JavaScript/TypeScript", () => {
    const project = detectProject();
    const jsLang = project.languages.find((l) => l.name === "JavaScript/TypeScript");
    expect(jsLang).toBeDefined();
    expect(jsLang?.suggestedLinters).toContain("biome");
  });

  it("should detect npm as package manager", () => {
    const project = detectProject();
    expect(project.packageManagers).toContain("npm");
  });

  it("should return arrays for all fields", () => {
    const project = detectProject();
    expect(Array.isArray(project.languages)).toBe(true);
    expect(Array.isArray(project.packageManagers)).toBe(true);
    expect(Array.isArray(project.frameworks)).toBe(true);
    expect(typeof project.hasHusky).toBe("boolean");
    expect(typeof project.hasLefthook).toBe("boolean");
  });

  it("should detect nested stylesheet files", () => {
    const projectDir = createProject(["app/frontend/styles/main.css"]);
    const project = detectProject(projectDir);
    expect(project.languages.find((l) => l.name === "CSS/SCSS")).toBeDefined();
  });

  it("should attach Rails linters to Ruby and ERB detection", () => {
    const projectDir = createProject([
      "Gemfile",
      "config/routes.rb",
      "bin/rails",
      "app/views/home/index.erb",
    ]);
    const project = detectProject(projectDir);
    expect(project.frameworks).toContain("Rails");
    expect(project.languages.find((l) => l.name === "Ruby")?.suggestedLinters).toContain("brakeman");
    expect(project.languages.find((l) => l.name === "ERB")?.suggestedLinters).toContain("erblint");
  });
});

describe("getAllSuggestedLinters", () => {
  it("should aggregate linters from all languages", () => {
    const project = {
      languages: [
        { name: "JS", reason: "package.json", suggestedLinters: ["biome" as const] },
        { name: "Python", reason: "setup.py", suggestedLinters: ["ruff" as const] },
      ],
      packageManagers: [],
      frameworks: [],
      hasHusky: false,
      hasLefthook: false,
    };
    const linters = getAllSuggestedLinters(project);
    expect(linters).toContain("biome");
    expect(linters).toContain("ruff");
  });

  it("should deduplicate linters", () => {
    const project = {
      languages: [
        { name: "JS", reason: "a", suggestedLinters: ["biome" as const] },
        { name: "CSS", reason: "b", suggestedLinters: ["biome" as const] },
      ],
      packageManagers: [],
      frameworks: [],
      hasHusky: false,
      hasLefthook: false,
    };
    const linters = getAllSuggestedLinters(project);
    expect(linters.filter((l) => l === "biome")).toHaveLength(1);
  });
});

describe("checkLinterInstallation", () => {
  it("should return installation status for each linter", () => {
    const result = checkLinterInstallation(["biome", "ruff"]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("biome");
    expect(typeof result[0].installed).toBe("boolean");
    expect(result[1].name).toBe("ruff");
    expect(typeof result[1].installed).toBe("boolean");
  });
});
