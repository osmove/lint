import chalk from "chalk";
import { chat } from "./client.js";
import type { LintReport } from "../types.js";

const SYSTEM_PROMPT = `You are a friendly code mentor working as part of Omnilint, a universal linting tool.
Your job is to explain linting errors in plain language so developers can learn from them.

For each error/warning:
1. Explain what the rule means and why it exists
2. Show what's wrong in the code
3. Show how to fix it with a code example
4. Rate importance: 🔴 Must fix, 🟡 Should fix, 🔵 Nice to fix

Be concise but educational. Use simple language.`;

export async function explainErrors(reports: LintReport[]): Promise<void> {
  const allOffenses = reports.flatMap((r) =>
    r.files.flatMap((f) =>
      f.offenses.map((o) => ({
        linter: r.linter,
        file: f.path,
        ...o,
      })),
    ),
  );

  if (allOffenses.length === 0) {
    console.log(chalk.green("No errors to explain — your code is clean!"));
    return;
  }

  // Limit to first 20 unique rules
  const uniqueRules = [...new Set(allOffenses.map((o) => o.rule))].slice(0, 20);
  const selectedOffenses = uniqueRules.map((rule) => allOffenses.find((o) => o.rule === rule)!);

  console.log(chalk.cyan(`\nExplaining ${selectedOffenses.length} linting issue(s)...\n`));

  const errorSummary = selectedOffenses
    .map((o) => `- [${o.linter}] ${o.rule}: "${o.message}" in ${o.file}:${o.line}`)
    .join("\n");

  const userMessage = `Explain these linting errors:\n\n${errorSummary}`;

  try {
    await chat(SYSTEM_PROMPT, userMessage, { stream: true, maxTokens: 4096 });
  } catch (error) {
    console.log(chalk.red("\nAI explain failed:"), (error as Error).message);
  }
}
