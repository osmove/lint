// Thin fetch wrapper to the embedded @lint/server. In dev, vite proxies
// /api → 127.0.0.1:7878. In production (Electron), the same origin serves
// both the SPA and the API.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string; version: string }>("/api/health"),
  listRuns: () => request<{ runs: unknown[] }>("/api/runs"),
  listRepos: () => request<{ repos: unknown[] }>("/api/repos"),
  getPolicies: () => request<{ filePath: string | null; rc: unknown; yaml: string }>("/api/policies"),
  getLinters: () => request<{ detected: unknown; suggested: string[] }>("/api/linters"),
};
