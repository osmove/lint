import { serve, type ServerType } from "@hono/node-server";
import { buildApp, VERSION } from "./app.js";
import { resolveProject, type ServerProject } from "./project-context.js";

export interface StartServerOptions {
  workspace?: string;
  port?: number;
  host?: string;
  uiDistDir?: string;
}

export interface RunningServer {
  url: string;
  port: number;
  host: string;
  workspace: ServerProject;
  close: () => Promise<void>;
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const workspace = resolveProject(options.workspace);
  const appOptions: { workspace: ServerProject; uiDistDir?: string } = { workspace };
  if (options.uiDistDir) appOptions.uiDistDir = options.uiDistDir;
  const { app, buses } = buildApp(appOptions);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 7878;

  const server: ServerType = await new Promise((resolvePromise) => {
    const instance = serve({ fetch: app.fetch, port, hostname: host }, () => {
      resolvePromise(instance);
    });
  });

  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    url: `http://${displayHost}:${boundPort}`,
    port: boundPort,
    host,
    workspace,
    close: () =>
      new Promise<void>((closeResolve, closeReject) => {
        buses.stopAll();
        const closeable = server as unknown as { closeAllConnections?: () => void };
        if (typeof closeable.closeAllConnections === "function") {
          try {
            closeable.closeAllConnections();
          } catch {
            // best effort
          }
        }
        server.close((error) => {
          if (error) {
            closeReject(error);
          } else {
            closeResolve();
          }
        });
      }),
  };
}

export { buildApp, VERSION };
export type { ServerProject } from "./project-context.js";
