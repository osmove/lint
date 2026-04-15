import chalk from "chalk";
import { chat, getApiKey } from "./client.js";

const SYSTEM_PROMPT = `You are a linting rules expert. When given a lint rule name, explain:

1. **What it does** — One sentence
2. **Why it matters** — The problem it prevents
3. **Example** — Code that triggers it, and how to fix it
4. **Severity** — Typical: error, warning, or info

Be concise. Format with markdown. If you don't recognize the rule, say so and suggest the closest match.`;

export async function explainRule(ruleName: string): Promise<void> {
  if (!getApiKey()) {
    console.log(chalk.yellow("AI not configured. Run 'lint ai setup' first."));
    console.log(
      chalk.gray(`\nAlternative: search for "${ruleName}" on the linter's documentation.`),
    );
    return;
  }

  console.log(chalk.cyan(`\nExplaining rule: ${chalk.bold(ruleName)}\n`));

  try {
    await chat(SYSTEM_PROMPT, `Explain the lint rule: ${ruleName}`, {
      stream: true,
      maxTokens: 1024,
    });
  } catch (error) {
    console.log(chalk.red("\nFailed:"), (error as Error).message);
  }
}
