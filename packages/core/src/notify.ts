import path from "node:path";
import type { LintRC } from "@lint/config";

// Slack / Discord webhook fan-out for completed runs. Reads the
// `notify:` block of .lintrc.yaml. Only fires when the run's outcome
// is in `notify.on` (defaults to ["failed"] — silent on green).
//
// Webhook URLs may be ${VAR} templates so users keep secrets out of
// the file: `slack: ${SLACK_WEBHOOK}` is resolved from the environment.
//
// Best-effort by design — every fetch error is swallowed. A missing
// webhook must never break a CI run.

export interface NotifyContext {
  status: "passed" | "failed";
  totalErrors: number;
  totalWarnings: number;
  repoRoot: string;
  /** Optional ref / branch / commit info added to the message. */
  ref?: string;
  notify?: LintRC["notify"];
}

const TEMPLATE_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

function resolveTemplate(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(TEMPLATE_RE, (_, name) => env[name] ?? "");
}

function shouldFire(notify: NonNullable<LintRC["notify"]>, status: "passed" | "failed"): boolean {
  const on = notify.on ?? ["failed"];
  return on.includes(status);
}

function buildText(ctx: NotifyContext): string {
  const repoName = path.basename(ctx.repoRoot);
  const flag = ctx.status === "failed" ? "FAIL" : "PASS";
  const errs = `${ctx.totalErrors} error${ctx.totalErrors === 1 ? "" : "s"}`;
  const warns = `${ctx.totalWarnings} warning${ctx.totalWarnings === 1 ? "" : "s"}`;
  const refSuffix = ctx.ref ? ` · ${ctx.ref}` : "";
  return `[lint ${flag}] ${repoName}${refSuffix} — ${errs}, ${warns}`;
}

async function postSlack(url: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function postDiscord(url: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Discord rejects messages > 2000 chars. Truncate defensively.
      body: JSON.stringify({ content: text.slice(0, 1900) }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fireNotifyWebhooks(
  ctx: NotifyContext,
): Promise<{ slack?: boolean; discord?: boolean }> {
  const notify = ctx.notify;
  if (!notify || !shouldFire(notify, ctx.status)) return {};
  const text = buildText(ctx);
  const result: { slack?: boolean; discord?: boolean } = {};
  const tasks: Promise<void>[] = [];
  if (notify.slack) {
    const url = resolveTemplate(notify.slack);
    if (url) tasks.push(postSlack(url, text).then((ok) => void (result.slack = ok)));
  }
  if (notify.discord) {
    const url = resolveTemplate(notify.discord);
    if (url) tasks.push(postDiscord(url, text).then((ok) => void (result.discord = ok)));
  }
  await Promise.all(tasks);
  return result;
}

// Internal helpers exposed for tests.
export const __test__ = { resolveTemplate, shouldFire, buildText };
