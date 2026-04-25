import type { FastifyInstance } from "fastify";

interface HealthOptions {
  version: string;
}

export async function registerHealthRoutes(
  server: FastifyInstance,
  options: HealthOptions,
): Promise<void> {
  server.get("/", async () => ({
    name: "lint-server",
    version: options.version,
    status: "ok",
  }));

  server.get("/health", async () => ({
    status: "ok",
    version: options.version,
    uptime: process.uptime(),
  }));
}
