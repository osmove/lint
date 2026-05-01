import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import pkg from "electron-updater";
import { startServer, type RunningServer } from "@lint/server";
import { resolveWorkspace } from "./workspace-picker.js";

const { autoUpdater } = pkg;

ipcMain.handle("lint:open-path", async (_event, target: unknown) => {
  if (typeof target !== "string" || !target) return "invalid_path";
  return shell.openPath(target);
});
ipcMain.handle("lint:show-in-folder", async (_event, target: unknown) => {
  if (typeof target !== "string" || !target) return;
  shell.showItemInFolder(target);
});
ipcMain.handle("lint:open-external", async (_event, url: unknown) => {
  if (typeof url !== "string" || !url) return;
  if (!/^https?:\/\//.test(url)) return; // never let renderer open file:// URLs
  await shell.openExternal(url);
});
ipcMain.handle("lint:pick-folder", async (event, opts: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const raw = (opts && typeof opts === "object" ? opts : {}) as {
    title?: string;
    defaultPath?: string;
  };
  const dialogOptions: Electron.OpenDialogOptions = {
    properties: ["openDirectory", "createDirectory"],
  };
  if (raw.title) dialogOptions.title = raw.title;
  if (raw.defaultPath) dialogOptions.defaultPath = raw.defaultPath;
  const result = win
    ? await dialog.showOpenDialog(win, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

app.setName("Lint");

let serverHandle: RunningServer | null = null;
let mainWindow: BrowserWindow | null = null;

function uiDistDir(): string {
  return path.join(import.meta.dirname, "public");
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "Lint",
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(import.meta.dirname, "preload.cjs"),
    },
  });

  const workspace = await resolveWorkspace(mainWindow);
  if (!workspace) {
    mainWindow.close();
    mainWindow = null;
    app.quit();
    return;
  }

  serverHandle = await startServer({
    host: "127.0.0.1",
    port: 0,
    workspace,
    uiDistDir: uiDistDir(),
  });

  console.log(`Lint desktop serving ${workspace} at ${serverHandle.url}`);
  await mainWindow.loadURL(serverHandle.url);
  mainWindow.show();

  // Route window.open(url) the renderer attempts to the OS browser instead of
  // spawning child BrowserWindows (matters for OAuth flows where the user is
  // signed in to GitHub/Google in their actual browser).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();

  if (process.env.NODE_ENV !== "development") {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Best-effort — never crash the app over a failed update check.
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (serverHandle) {
    try {
      await serverHandle.close();
    } catch {
      // best effort
    }
    serverHandle = null;
  }
});
