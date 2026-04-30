import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, MenuItem } from "electron";
import { listProjects, registerProject } from "@lint/core";

const LAST_WORKSPACE_KEY = "lint.lastWorkspace";

interface PrefsStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// Tiny JSON-backed prefs at app.getPath('userData') — last workspace
// only. The cross-machine source of truth is ~/.lint/projects.json
// (managed by @lint/core/projects-registry).
function makePrefs(): PrefsStore {
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

async function pickViaOSDialog(parent: BrowserWindow | null): Promise<string | null> {
  const opts: Electron.OpenDialogOptions = {
    title: "Choose a repo to lint",
    properties: ["openDirectory"],
  };
  const result = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

// Build the candidate list: last-used first (if it still exists), then
// every registered repo, deduped. Up to 4 entries are surfaced as button
// options in the showMessageBox flow; the user always has an "Open
// another folder" escape hatch.
function buildCandidates(prefs: PrefsStore): string[] {
  const last = prefs.get(LAST_WORKSPACE_KEY);
  const registered = listProjects().map((p) => p.root);
  const all = [last, ...registered].filter((p): p is string => !!p && fs.existsSync(p));
  return [...new Set(all)];
}

export async function resolveWorkspace(parent: BrowserWindow | null): Promise<string | null> {
  const prefs = makePrefs();
  const candidates = buildCandidates(prefs);

  // No history → straight to the OS picker.
  if (candidates.length === 0) {
    const picked = await pickViaOSDialog(parent);
    if (picked) {
      prefs.set(LAST_WORKSPACE_KEY, picked);
      registerProject(picked);
    }
    return picked;
  }

  // Single known repo → silently re-open. Faster boot, fewer clicks.
  if (candidates.length === 1) {
    return candidates[0]!;
  }

  // 2+ candidates → show a quick picker. We cap the list at 4 so the
  // dialog doesn't grow into a wall of buttons; if the user has more
  // than 4 registered repos, they pick from the top 4 or click
  // "Open another folder" to navigate to one not in the recent list.
  const visible = candidates.slice(0, 4);
  const labels = visible.map((p) => path.basename(p));
  const buttons = [...labels, "Open another folder…"];

  const choice = await dialog.showMessageBox(parent ?? new BrowserWindow({ show: false }), {
    type: "question",
    title: "Lint",
    message: "Open which repo?",
    detail: visible.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1, // pressing Esc → "Open another folder"
  });

  if (choice.response < visible.length) {
    const picked = visible[choice.response]!;
    prefs.set(LAST_WORKSPACE_KEY, picked);
    return picked;
  }

  // "Open another folder…"
  const picked = await pickViaOSDialog(parent);
  if (picked) {
    prefs.set(LAST_WORKSPACE_KEY, picked);
    registerProject(picked);
  }
  return picked;
}

// "File → Open Recent" submenu populated from the registry. Called by
// main.ts after the window is created, so the menu can dispatch into
// the renderer (or here, swap the workspace by reloading the URL).
export function buildRecentReposMenu(onPick: (root: string) => void): MenuItem[] {
  const items = listProjects().map(
    (p) =>
      new MenuItem({
        label: `${p.name}  —  ${p.root}`,
        click: () => onPick(p.root),
      }),
  );
  if (items.length === 0) {
    items.push(
      new MenuItem({
        label: "(no registered repos)",
        enabled: false,
      }),
    );
  }
  items.push(new MenuItem({ type: "separator" }));
  items.push(
    new MenuItem({
      label: "Add current workspace…",
      click: async () => {
        const picked = await pickViaOSDialog(null);
        if (picked) {
          registerProject(picked);
          onPick(picked);
        }
      },
    }),
  );
  return items;
}
