import os from "node:os";
import path from "node:path";

export const VERSION = "1.0.0";

export const API_BASE_URL = process.env.OMNILINT_API_URL || "https://api.omnilint.com";

export const HOME_DIR = os.homedir();
export const LINT_DIR = ".lint";
export const REFS_DIR = path.join(HOME_DIR, LINT_DIR, "refs");
export const USERNAME_PATH = path.join(REFS_DIR, "user");
export const TOKEN_PATH = path.join(REFS_DIR, "token");
export const AI_CONFIG_PATH = path.join(HOME_DIR, LINT_DIR, "ai-config");

export const SUPPORTED_EXTENSIONS: Record<string, string[]> = {
  eslint: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  prettier: [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".scss",
    ".less",
    ".json",
    ".html",
    ".vue",
    ".yaml",
    ".yml",
    ".md",
  ],
  rubocop: [".rb", ".rake", ".gemspec"],
  erblint: [".erb"],
  brakeman: [".rb"],
  stylelint: [".css", ".scss", ".sass", ".less"],
  pylint: [".py"],
  biome: [".js", ".jsx", ".ts", ".tsx", ".json", ".css"],
  ruff: [".py", ".pyi"],
  oxlint: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
};

export const FILE_EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".rb": "ruby",
  ".rake": "ruby",
  ".gemspec": "ruby",
  ".erb": "erb",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".json": "json",
  ".html": "html",
  ".vue": "vue",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
};
