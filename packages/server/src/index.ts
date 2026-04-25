#!/usr/bin/env node
import { buildServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";

const server = await buildServer();

server
  .listen({ port: PORT, host: HOST })
  .then(() => {
    server.log.info(`lint-server listening on http://${HOST}:${PORT}`);
  })
  .catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
