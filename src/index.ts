import { confirm, input, password } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { saveApiKey } from "./ai/client.js";
import { explainErrors } from "./ai/explain.js";
import { fixStagedChanges } from "./ai/fix.js";
import { reviewStagedChanges } from "./ai/review.js";
import * as auth from "./auth.js";
import { VERSION } from "./config.js";
import { getStagedFilePaths, init, installHooks, uninstallHooks } from "./git.js";
import {
  ALL_LINTERS,
  lintStaged,
  postCommitHook,
  preCommit,
  prepareCommitMsg,
  prettifyProject,
} from "./orchestrator.js";
import type { LintReport } from "./types.js";

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
  .option("--fix", "Auto-fix issues where supported")
  .option("--verbose", "Show detailed output")
  .action((options) => {
    preCommit({
      keep: options.keep,
      time: options.time,
      truncate: options.truncate,
      format: options.format,
      fix: options.fix,
      verbose: options.verbose,
    });
  });

program
  .command("lint:staged")
  .description("Lint staged files")
  .option("-f, --format <format>", "Output format")
  .option("--fix", "Auto-fix issues where supported")
  .option("--verbose", "Show detailed output")
  .action((options) => {
    lintStaged(options);
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

ai.command("explain")
  .description("Explain linting errors in plain language")
  .action(async () => {
    console.log(chalk.cyan("Running linters to collect errors...\n"));
    const files = getStagedFilePaths();
    if (files.length === 0) {
      console.log(chalk.yellow("No staged files."));
      return;
    }
    const reports: LintReport[] = [];
    for (const linter of ALL_LINTERS) {
      if (!linter.isInstalled()) continue;
      if (linter.selectFiles(files).length === 0) continue;
      const result = linter.execute(files, [], false);
      if (result?.report) reports.push(result.report);
    }
    await explainErrors(reports);
  });

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

program
  .option("--fix", "Auto-fix issues where supported")
  .option("--verbose", "Show detailed output")
  .action((options) => {
    lintStaged({ fix: options.fix, verbose: options.verbose });
  });

program.parse();
