import { fileURLToPath } from "node:url";

function packageEntry(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export const workspaceAliases = [
  { find: "@lint/schemas", replacement: packageEntry("./packages/schemas/src/index.ts") },
  { find: "@lint/config", replacement: packageEntry("./packages/config/src/index.ts") },
  { find: "@lint/git", replacement: packageEntry("./packages/git/src/index.ts") },
  { find: "@lint/hooks", replacement: packageEntry("./packages/hooks/src/index.ts") },
  { find: "@lint/linters", replacement: packageEntry("./packages/linters/src/index.ts") },
  { find: "@lint/ai", replacement: packageEntry("./packages/ai/src/index.ts") },
  { find: "@lint/policies", replacement: packageEntry("./packages/policies/src/index.ts") },
  { find: "@lint/core", replacement: packageEntry("./packages/core/src/index.ts") },
  { find: "@lint/server", replacement: packageEntry("./packages/server/src/index.ts") },
  { find: "@osmove/lint-sdk", replacement: packageEntry("./packages/sdk/src/index.ts") },
];
