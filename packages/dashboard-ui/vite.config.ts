import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// The dashboard build is consumed by @lint/server (which serves dist/) and by
// @lint/desktop (which copies dist into the Electron asar at build time).
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7878",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
