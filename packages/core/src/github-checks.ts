import type { LintReport } from "@lint/schemas";

// GitHub Checks API integration. When `lint ci` (or any --format json
// run) executes inside a GitHub Actions workflow, this turns the lint
// report into a Check Run on the head commit, with one annotation per
// offense (capped at 50 per the Checks API limit).
//
// Auth: uses GITHUB_TOKEN that Actions provides automatically — no
// extra secret needed. The token must have `checks:write` permission;
// add `permissions: { checks: write }` to the workflow job that runs
// `lint ci`.

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: "failure" | "warning" | "notice";
  message: string;
  title?: string;
  raw_details?: string;
}

export interface PostCheckRunOptions {
  token: string;
  owner: string;
  repo: string;
  sha: string;
  name?: string;
  status?: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out";
  title: string;
  summary: string;
  text?: string;
  annotations?: CheckAnnotation[];
}

export interface GitHubContext {
  token: string;
  owner: string;
  repo: string;
  sha: string;
}

// Returns the GitHub context if we're running inside a GitHub Actions
// workflow with the right env vars set, otherwise null. Callers should
// short-circuit on null and not bother building annotations.
export function detectGitHubContext(env: NodeJS.ProcessEnv = process.env): GitHubContext | null {
  if (env.GITHUB_ACTIONS !== "true") return null;
  const token = env.GITHUB_TOKEN;
  const repoSlug = env.GITHUB_REPOSITORY; // "owner/repo"
  const sha = env.GITHUB_SHA;
  if (!token || !repoSlug || !sha) return null;
  const slash = repoSlug.indexOf("/");
  if (slash <= 0) return null;
  return {
    token,
    owner: repoSlug.slice(0, slash),
    repo: repoSlug.slice(slash + 1),
    sha,
  };
}

const SEVERITY_TO_LEVEL: Record<string, CheckAnnotation["annotation_level"]> = {
  error: "failure",
  warning: "warning",
  info: "notice",
};

// Flatten a LintReport[] into Check annotations. The Checks API caps
// the array at 50 entries per call, but since we may have more we
// truncate here — the dashboard / CLI already show the full set, the
// PR view is just a summary.
export function reportsToAnnotations(reports: LintReport[], cap = 50): CheckAnnotation[] {
  const out: CheckAnnotation[] = [];
  for (const report of reports) {
    for (const file of report.files) {
      for (const offense of file.offenses) {
        if (out.length >= cap) return out;
        out.push({
          path: file.path,
          start_line: offense.line,
          end_line: offense.line,
          start_column: offense.column,
          end_column: offense.column,
          annotation_level: SEVERITY_TO_LEVEL[offense.severity] ?? "notice",
          message: offense.message,
          title: `${report.linter} · ${offense.rule}`,
        });
      }
    }
  }
  return out;
}

// POST a Check Run via the GitHub REST API. Best-effort: returns null
// on any error so callers can swallow without disrupting the lint flow.
export async function postCheckRun(
  options: PostCheckRunOptions,
): Promise<{ id: number; html_url: string } | null> {
  const url = `https://api.github.com/repos/${options.owner}/${options.repo}/check-runs`;
  const body: Record<string, unknown> = {
    name: options.name ?? "Lint",
    head_sha: options.sha,
    status: options.status ?? "completed",
    output: {
      title: options.title,
      summary: options.summary,
      ...(options.text ? { text: options.text } : {}),
      ...(options.annotations && options.annotations.length > 0
        ? { annotations: options.annotations }
        : {}),
    },
  };
  if (body.status === "completed" && options.conclusion) {
    body.conclusion = options.conclusion;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `token ${options.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "lint-cli",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id: number; html_url: string };
    return { id: data.id, html_url: data.html_url };
  } catch {
    return null;
  }
}

// Convenience: detect context, build annotations, post the check.
// Returns null when not in GitHub CI or when the post fails. Callers
// in @lint/core should call this fire-and-forget at the end of a run.
export async function postCheckRunIfCI(args: {
  reports: LintReport[];
  totalErrors: number;
  totalWarnings: number;
  fileCount: number;
  linterCount: number;
}): Promise<{ id: number; html_url: string } | null> {
  const ctx = detectGitHubContext();
  if (!ctx) return null;
  const annotations = reportsToAnnotations(args.reports);
  const conclusion: PostCheckRunOptions["conclusion"] =
    args.totalErrors > 0 ? "failure" : "success";
  const title =
    args.totalErrors > 0
      ? `${args.totalErrors} error${args.totalErrors > 1 ? "s" : ""}, ${args.totalWarnings} warning${args.totalWarnings === 1 ? "" : "s"}`
      : args.totalWarnings > 0
        ? `${args.totalWarnings} warning${args.totalWarnings > 1 ? "s" : ""}`
        : "All clean";
  return postCheckRun({
    ...ctx,
    conclusion,
    title,
    summary: `${args.linterCount} linter(s) ran across ${args.fileCount} file(s).`,
    annotations,
  });
}
