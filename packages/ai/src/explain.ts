import chalk from "chalk";
import type { LintReport } from "@lint/schemas";
import { chat } from "./client.js";

const SYSTEM_PROMPT = `You are a friendly code mentor working as part of Lint, a universal linting tool.
Your job is to explain linting errors in plain language so developers can learn from them.

For each error/warning:
1. Explain what the rule means and why it exists
2. Show what's wrong in the code
3. Show how to fix it with a code example
4. Rate importance: 🔴 Must fix, 🟡 Should fix, 🔵 Nice to fix

Be concise but educational. Use simple language.`;

export interface ExplainInput {
  reports: LintReport[];
}

export interface ExplainResult {
  text: string;
  uniqueRuleCount: number;
}

function selectOffenses(reports: LintReport[]) {
  const all = reports.flatMap((r) =>
    r.files.flatMap((f) => f.offenses.map((o) => ({ linter: r.linter, file: f.path, ...o }))),
  );
  // Cap at 20 unique rules so the prompt stays bounded.
  const uniqueRules = [...new Set(all.map((o) => o.rule))].slice(0, 20);
  return uniqueRules
    .map((rule) => all.find((o) => o.rule === rule))
    .filter((o): o is NonNullable<typeof o> => o !== undefined);
}

function buildExplainUserMessage(selectedOffenses: ReturnType<typeof selectOffenses>): string {
  const summary = selectedOffenses
    .map((o) => `- [${o.linter}] ${o.rule}: "${o.message}" in ${o.file}:${o.line}`)
    .join("\n");
  return `Explain these linting errors:\n\n${summary}`;
}

// Programmatic entry point — used by @lint/server's POST /api/ai/explain.
export async function runExplain(input: ExplainInput): Promise<ExplainResult> {
  const selected = selectOffenses(input.reports);
  if (selected.length === 0) {
    return { text: "No errors to explain — your code is clean!", uniqueRuleCount: 0 };
  }
  const text = await chat(SYSTEM_PROMPT, buildExplainUserMessage(selected), {
    stream: false,
    maxTokens: 4096,
  });
  return { text, uniqueRuleCount: selected.length };
}

// CLI form — streams to stdout. Kept for `lint ai explain`.
export async function explainErrors(reports: LintReport[]): Promise<void> {
  const selected = selectOffenses(reports);
  if (selected.length === 0) {
    console.log(chalk.green("No errors to explain — your code is clean!"));
    return;
  }
  console.log(chalk.cyan(`\nExplaining ${selected.length} linting issue(s)...\n`));
  try {
    await chat(SYSTEM_PROMPT, buildExplainUserMessage(selected), {
      stream: true,
      maxTokens: 4096,
    });
  } catch (error) {
    console.log(chalk.red("\nAI explain failed:"), (error as Error).message);
  }
}
