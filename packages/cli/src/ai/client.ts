import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import { AI_CONFIG_PATH } from "../config.js";
import { ensureDir } from "../utils.js";

let clientInstance: Anthropic | null = null;

export function getApiKey(): string | null {
  // Check environment variable first
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return envKey;

  // Check stored config
  try {
    const config = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, "utf-8"));
    return config.api_key || null;
  } catch {
    return null;
  }
}

export function saveApiKey(apiKey: string): void {
  ensureDir(path.dirname(AI_CONFIG_PATH));
  fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify({ api_key: apiKey }), "utf-8");
}

export function getClient(): Anthropic | null {
  if (clientInstance) return clientInstance;

  const apiKey = getApiKey();
  if (!apiKey) return null;

  clientInstance = new Anthropic({ apiKey });
  return clientInstance;
}

export async function ensureClient(): Promise<Anthropic> {
  const client = getClient();
  if (client) return client;

  console.log(chalk.yellow("No Anthropic API key found."));
  console.log("Get one at https://console.anthropic.com/\n");

  const apiKey = await input({
    message: "Enter your Anthropic API key:",
  });

  if (!apiKey.startsWith("sk-")) {
    throw new Error("Invalid API key format. Keys start with 'sk-'.");
  }

  saveApiKey(apiKey);
  clientInstance = new Anthropic({ apiKey });
  console.log(chalk.green("API key saved.\n"));
  return clientInstance;
}

export async function chat(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; stream?: boolean },
): Promise<string> {
  const client = await ensureClient();
  const maxTokens = options?.maxTokens || 4096;

  if (options?.stream) {
    let result = "";
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        process.stdout.write(event.delta.text);
        result += event.delta.text;
      }
    }
    console.log(); // newline after streaming
    return result;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock ? textBlock.text : "";
}
