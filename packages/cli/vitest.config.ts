import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../vitest.workspace-aliases.js";

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 50,
      },
    },
    testTimeout: 10000,
  },
});
