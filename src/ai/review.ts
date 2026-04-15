import chalk from "chalk";
import { createSpinner } from "nanospinner";
import { chat } from "./client.js";
import { getStagedDiff, getStagedFilePaths } from "../git.js";

const SYSTEM_PROMPT = `You are an expert code reviewer working as part of Omnilint, a universal linting tool.
Your job is to review code changes (git diffs) and provide actionable feedback.

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code quality and maintainability
- Best practices for the language being used

Be concise. Use this format for each issue:
**[severity]** \`file:line\` - description
- Suggestion: how to fix

Where severity is one of: 🔴 ERROR, 🟡 WARNING, 🔵 INFO

End with a brief summary.`;

export async function reviewStagedChanges(): Promise<void> {
  const files = getStagedFilePaths();
  if (files.length === 0) {
    console.log(chalk.yellow("No staged files to review."));
    return;
  }

  const diff = getStagedDiff();
  if (!diff) {
    console.log(chalk.yellow("No changes detected in staged files."));
    return;
  }

  console.log(chalk.cyan(`\nReviewing ${files.length} staged file(s) with AI...\n`));

  const userMessage = `Review these staged changes:\n\nFiles: ${files.join(", ")}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;

  try {
    await chat(SYSTEM_PROMPT, userMessage, { stream: true, maxTokens: 4096 });
  } catch (error) {
    console.log(chalk.red("\nAI review failed:"), (error as Error).message);
  }
}
