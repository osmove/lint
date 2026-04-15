import chalk from "chalk";
import * as api from "../api.js";
import { getToken } from "../auth.js";
import { chat, getApiKey } from "./client.js";

const SYSTEM_PROMPT = `You are a linting policy generator. Given a description of desired code standards, generate a .lintrc.yaml configuration for Omnilint.

Output ONLY valid YAML. The format is:

\`\`\`yaml
linters:
  enabled: [biome, ruff]     # Choose from: biome, oxlint, eslint, prettier, ruff, pylint, rubocop, erblint, brakeman, stylelint
  disabled: []

ignore:
  - node_modules/**
  - dist/**

fix:
  enabled: true
  strategy: formatter-first   # or: parallel, sequential

hooks:
  timeout: 60
  skip_env: OMNILINT_SKIP
\`\`\`

Tailor the config to the description. Only include linters relevant to the described stack.`;

export async function generatePolicyLocal(description: string): Promise<void> {
  if (!getApiKey()) {
    console.log(chalk.yellow("AI not configured. Run 'lint ai setup' first."));
    return;
  }

  console.log(chalk.cyan("\nGenerating policy from description...\n"));

  try {
    await chat(SYSTEM_PROMPT, `Generate a linting policy for: ${description}`, {
      stream: true,
      maxTokens: 2048,
    });
    console.log(chalk.gray("\nSave this as .lintrc.yaml in your project root."));
  } catch (error) {
    console.log(chalk.red("\nFailed:"), (error as Error).message);
  }
}

export async function generatePolicyRemote(description: string, language: string): Promise<void> {
  const token = getToken();
  if (!token) {
    console.log(chalk.yellow("Not logged in. Using local AI instead."));
    return generatePolicyLocal(description);
  }

  console.log(chalk.cyan("\nGenerating policy via Omnilint API...\n"));

  const result = await api.generatePolicy(token, description, language);
  if (result.data?.policy) {
    console.log(chalk.green("Policy generated:\n"));
    console.log(JSON.stringify(result.data.policy, null, 2));
  } else {
    console.log(chalk.yellow("API unavailable. Falling back to local AI."));
    return generatePolicyLocal(description);
  }
}
