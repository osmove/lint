import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  // Bundle every workspace-internal package into the single CLI tarball that
  // ships to npm. End-users install `lint` and get everything in one shot —
  // no separate @lint/* dist artifacts needed at runtime.
  noExternal: [/^@lint\//],
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __LINT_VERSION__: JSON.stringify(pkg.version),
  },
});
