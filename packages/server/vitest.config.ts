import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    // Each test file gets a fresh module graph, so the singleton SQLite
    // connection in src/db/index.ts is recreated against a fresh DB path.
    isolate: true,
    fileParallelism: false,
  },
});
