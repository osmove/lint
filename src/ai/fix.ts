import fs from "node:fs";
import chalk from "chalk";
import { getStagedDiff, getStagedFilePaths } from "../git.js";
import { chat } from "./client.js";

const SYSTEM_PROMPT = `You are an expert code fixer working as part of Omnilint, a universal linting tool.
Given a git diff of staged changes, identify issues and provide fixed code.

For each fix:
1. Explain what the issue is (one line)
2. Show the corrected code block

Only suggest fixes for genuine issues (bugs, security, performance).
Do NOT suggest style changes or subjective improvements.

Format each fix as:
### Fix: <brief description>
**File:** \`path/to/file\`
**Issue:** <explanation>
\`\`\`<language>
<corrected code>
\`\`\``;

export async function fixStagedChanges(): Promise<void> {
  const files = getStagedFilePaths();
  if (files.length === 0) {
    console.log(chalk.yellow("No staged files to fix."));
    return;
  }

  const diff = getStagedDiff();
  if (!diff) {
    console.log(chalk.yellow("No changes detected in staged files."));
    return;
  }

  console.log(
    chalk.cyan(`\nAnalyzing ${files.length} staged file(s) for auto-fix suggestions...\n`),
  );

  // Also send file contents for full context
  const fileContents: string[] = [];
  for (const file of files.slice(0, 10)) {
    // Limit to 10 files
    try {
      const content = fs.readFileSync(file, "utf-8");
      if (content.length < 10000) {
        fileContents.push(`--- ${file} ---\n${content}`);
      }
    } catch {
      // Skip unreadable files
    }
  }

  const userMessage = `Analyze and suggest fixes for these staged changes:

Diff:
\`\`\`diff
${diff}
\`\`\`

${fileContents.length > 0 ? `\nFull file contents:\n${fileContents.join("\n\n")}` : ""}`;

  try {
    await chat(SYSTEM_PROMPT, userMessage, { stream: true, maxTokens: 4096 });
  } catch (error) {
    console.log(chalk.red("\nAI fix failed:"), (error as Error).message);
  }
}
