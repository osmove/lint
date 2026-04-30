import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";

const LAST_WORKSPACE_KEY = "lint.lastWorkspace";

interface WorkspaceStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// Tiny JSON-backed prefs store living in app.getPath('userData'). Keeping
// dependencies thin — no electron-store etc.
import fs from "node:fs";
function makeStore(): WorkspaceStore {
  const file = path.join(app.getPath("userData"), "prefs.json");
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  return {
    get: (key) => read()[key] ?? null,
    set: (key, value) => {
      const data = read();
      data[key] = value;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    },
  };
}

export async function resolveWorkspace(parent: BrowserWindow | null): Promise<string | null> {
  const store = makeStore();
  const last = store.get(LAST_WORKSPACE_KEY);
  if (last && fs.existsSync(last)) return last;

  const dialogOptions: Electron.OpenDialogOptions = {
    title: "Choose a repo to lint",
    properties: ["openDirectory"],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) return null;
  const [picked] = result.filePaths;
  store.set(LAST_WORKSPACE_KEY, picked);
  return picked;
}
