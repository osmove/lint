import { existsSync } from "node:fs";
import path from "node:path";
import { startServer } from "./index.js";

const dashboardDist = path.resolve(import.meta.dirname, "../../dashboard-ui/dist");

const handle = await startServer({
  host: process.env.LINT_SERVER_HOST ?? "127.0.0.1",
  port: Number(process.env.LINT_SERVER_PORT ?? 7878),
  uiDistDir: process.env.LINT_UI_DIST_DIR ?? (existsSync(dashboardDist) ? dashboardDist : undefined),
});

console.log(`Lint server listening on ${handle.url}`);

const shutdown = async () => {
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
