import fs from "node:fs";
import chalk from "chalk";
import { getStagedDiff, getStagedFilePaths } from "@lint/core";
import { chat } from "./client.js";

const SYSTEM_PROMPT = `You are an expert code fixer working as part of Lint, a universal linting tool.
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

export interface FixInput {
  diff: string;
  files: string[];
  // Pre-loaded file contents (path → contents). Optional. The server
  // populates this; the CLI variant reads them from disk itself.
  fileContents?: Record<string, string>;
}

export interface FixResult {
  text: string;
}

function buildFixUserMessage(input: FixInput): string {
  const blocks: string[] = [];
  if (input.fileContents) {
    for (const [path, content] of Object.entries(input.fileContents)) {
      if (content.length < 10_000) blocks.push(`--- ${path} ---\n${content}`);
    }
  }
  return `Analyze and suggest fixes for these staged changes:

Diff:
\`\`\`diff
${input.diff}
\`\`\`

${blocks.length > 0 ? `\nFull file contents:\n${blocks.join("\n\n")}` : ""}`;
}

// Programmatic entry point — used by @lint/server's POST /api/ai/fix.
export async function runFix(input: FixInput): Promise<FixResult> {
  const text = await chat(SYSTEM_PROMPT, buildFixUserMessage(input), {
    stream: false,
    maxTokens: 4096,
  });
  return { text };
}

// CLI form — streams to stdout. Kept for `lint ai fix`.
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

  const fileContents: Record<string, string> = {};
  for (const file of files.slice(0, 10)) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      if (content.length < 10_000) fileContents[file] = content;
    } catch {
      // Skip unreadable files
    }
  }

  try {
    await chat(SYSTEM_PROMPT, buildFixUserMessage({ diff, files, fileContents }), {
      stream: true,
      maxTokens: 4096,
    });
  } catch (error) {
    console.log(chalk.red("\nAI fix failed:"), (error as Error).message);
  }
}
