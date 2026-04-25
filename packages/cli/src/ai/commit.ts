import chalk from "chalk";
import { getStagedDiff, getStagedFilePaths } from "../git.js";
import { chat, getApiKey } from "./client.js";

const SYSTEM_PROMPT = `You are a git commit message generator. Given a diff of staged changes, write a concise, conventional commit message.

Rules:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Keep the first line under 72 characters
- Add a blank line then a brief body (2-3 bullet points) if the change is complex
- Be specific: "fix null check in user auth" not "fix bug"
- Never start with "Update" or "Change" — describe what was actually done

Output ONLY the commit message, nothing else.`;

export async function generateCommitMessage(): Promise<string | null> {
  if (!getApiKey()) return null;

  const files = getStagedFilePaths();
  if (files.length === 0) return null;

  const diff = getStagedDiff();
  if (!diff) return null;

  // Truncate diff to avoid token limits
  const truncatedDiff = diff.length > 8000 ? `${diff.substring(0, 8000)}\n... (truncated)` : diff;

  const userMessage = `Files: ${files.join(", ")}\n\nDiff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;

  try {
    const message = await chat(SYSTEM_PROMPT, userMessage, { maxTokens: 256 });
    return message.trim();
  } catch {
    return null;
  }
}

export async function printCommitSuggestion(): Promise<void> {
  console.log(chalk.cyan("Generating commit message from staged changes...\n"));

  const message = await generateCommitMessage();
  if (!message) {
    console.log(
      chalk.yellow("Could not generate commit message. Check your API key with 'lint ai setup'."),
    );
    return;
  }

  console.log(chalk.bold("Suggested commit message:\n"));
  console.log(`  ${chalk.green(message.split("\n").join("\n  "))}`);
  console.log(chalk.gray(`\n  Copy: git commit -m "${message.split("\n")[0]}"`));
}
