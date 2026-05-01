import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../vitest.workspace-aliases.js";

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
