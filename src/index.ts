import { Command } from "commander";
import chalk from "chalk";
import { input, password, confirm } from "@inquirer/prompts";
import { VERSION } from "./config.js";
import * as auth from "./auth.js";
import { init, installHooks, uninstallHooks } from "./git.js";
import { preCommit, lintStaged, prepareCommitMsg, postCommitHook, prettifyProject } from "./orchestrator.js";
import { reviewStagedChanges } from "./ai/review.js";
import { fixStagedChanges } from "./ai/fix.js";
import { saveApiKey } from "./ai/client.js";

const program = new Command();

program
  .name("lint")
  .description("Omnilint — The universal linter with AI-powered code review.")
  .version(VERSION, "-v, --version");

// ── Linting commands ──

program
  .command("pre-commit")
  .description("Run pre-commit linting on staged files")
  .option("-k, --keep", "Keep temporary files after linting")
  .option("-t, --time", "Show execution time")
  .option("-T, --truncate", "Truncate output to first 10 offenses per file")
  .option("-f, --format <format>", "Output format")
  .action((options) => {
    preCommit({
      keep: options.keep,
      time: options.time,
      truncate: options.truncate,
      format: options.format,
    });
  });

program
  .command("lint:staged")
  .description("Lint staged files")
  .option("-f, --format <format>", "Output format")
  .action((options) => {
    lintStaged(options.format);
  });

program
  .command("prettify <extension>")
  .description("Run Prettier on all files with the given extension")
  .action((extension) => {
    prettifyProject(extension);
  });

// ── Git hooks ──

program
  .command("prepare-commit-msg")
  .description("Trigger prepare-commit-msg hook")
  .action(() => prepareCommitMsg());

program
  .command("post-commit")
  .description("Trigger post-commit hook")
  .action(() => postCommitHook());

// ── Setup commands ──

program
  .command("init")
  .description("Initialize repository with Omnilint")
  .action(() => init());

program
  .command("install:hooks")
  .description("Install git hooks (pre-commit, prepare-commit-msg, post-commit)")
  .action(() => {
    console.log("Installing git hooks...");
    installHooks();
  });

program
  .command("uninstall:hooks")
  .description("Remove Omnilint git hooks")
  .action(() => {
    uninstallHooks();
  });

// ── AI commands ──

const ai = program.command("ai").description("AI-powered code analysis (powered by Claude)");

ai.command("review")
  .description("AI code review of staged changes")
  .action(() => reviewStagedChanges());

ai.command("fix")
  .description("AI-powered auto-fix suggestions for staged changes")
  .action(() => fixStagedChanges());

ai.command("setup")
  .description("Configure your Anthropic API key for AI features")
  .action(async () => {
    const apiKey = await input({
      message: "Enter your Anthropic API key (from https://console.anthropic.com/):",
    });
    if (!apiKey.startsWith("sk-")) {
      console.log(chalk.red("Invalid API key format. Keys start with 'sk-'."));
      return;
    }
    saveApiKey(apiKey);
    console.log(chalk.green("API key saved. AI features are now enabled."));
  });

// ── Account commands ──

program
  .command("login")
  .description("Sign in to Omnilint")
  .action(async () => {
    if (auth.isLoggedIn()) {
      console.log(`Already logged in as ${chalk.green(auth.getUsername())}.`);
      return;
    }
    const username = await input({ message: "Username or email:" });
    const pw = await password({ message: "Password:", mask: "*" });
    await auth.login(username, pw);
  });

program
  .command("logout")
  .description("Sign out from Omnilint")
  .action(async () => {
    if (!auth.isLoggedIn()) {
      console.log("Not logged in.");
      return;
    }
    const yes = await confirm({ message: "Are you sure you want to log out?" });
    if (yes) auth.logout();
  });

program
  .command("signup")
  .description("Create an Omnilint account")
  .action(async () => {
    if (auth.isLoggedIn()) {
      console.log(`Already logged in as ${chalk.green(auth.getUsername())}.`);
      return;
    }
    const username = await input({ message: "Username:" });
    const email = await input({ message: "Email:" });
    const pw = await password({ message: "Password:", mask: "*" });
    await auth.signup(username, email, pw);
  });

program
  .command("whoami")
  .description("Show current login status")
  .action(() => auth.printStatus());

// ── Default action ──

program.action(() => {
  // No subcommand → lint staged files
  lintStaged();
});

program.parse();
