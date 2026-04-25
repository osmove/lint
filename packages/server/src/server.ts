import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./routes/health.js";

declare const __LINT_SERVER_VERSION__: string;
const VERSION =
  typeof __LINT_SERVER_VERSION__ !== "undefined" ? __LINT_SERVER_VERSION__ : "0.0.0-dev";

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await server.register(cors, {
    origin: process.env.LINT_SERVER_CORS_ORIGIN ?? true,
  });

  await registerHealthRoutes(server, { version: VERSION });

  return server;
}

export { VERSION };
