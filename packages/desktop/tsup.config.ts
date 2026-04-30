import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "tsup";

// ESM main process (Electron 28+ supports it). Workspace packages bundled
// inline so the asar payload is self-contained; electron itself is provided
// by the runtime.
export default defineConfig([
  {
    entry: { main: "src/main.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    noExternal: [/^@lint\//, "execa"],
    external: ["electron"],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: false,
    shims: true,
    outDir: "dist",
    outExtension: () => ({ js: ".mjs" }),
    banner: {
      js: "import { createRequire as __lintCreateRequire } from 'node:module'; const require = __lintCreateRequire(import.meta.url);",
    },
    async onSuccess() {
      // Mirror the dashboard UI bundle next to main.mjs so the embedded
      // server serves it without an explicit path.
      const uiSrc = resolve(import.meta.dirname, "../dashboard-ui/dist");
      const uiDest = resolve(import.meta.dirname, "dist/public");
      if (existsSync(uiSrc)) {
        cpSync(uiSrc, uiDest, { recursive: true });
      }
    },
  },
  {
    entry: { preload: "src/preload.ts" },
    format: ["cjs"],
    target: "node20",
    platform: "node",
    external: ["electron"],
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    outDir: "dist",
    outExtension: () => ({ js: ".cjs" }),
  },
]);
