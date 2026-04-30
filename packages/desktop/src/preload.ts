import { contextBridge, ipcRenderer } from "electron";

// Surface exposed to the renderer via window.lint.*. Keep it tiny — anything
// the embedded Hono server can already do should go through HTTP, not IPC.
contextBridge.exposeInMainWorld("lint", {
  openPath: (target: string) => ipcRenderer.invoke("lint:open-path", target),
  showInFolder: (target: string) => ipcRenderer.invoke("lint:show-in-folder", target),
  openExternal: (url: string) => ipcRenderer.invoke("lint:open-external", url),
  pickFolder: (opts?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke("lint:pick-folder", opts),
});
