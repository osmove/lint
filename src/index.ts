import { confirm, input, password } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { saveApiKey } from "./ai/client.js";
import { printCommitSuggestion } from "./ai/commit.js";
import { explainErrors } from "./ai/explain.js";
import { fixStagedChanges } from "./ai/fix.js";
import { reviewStagedChanges } from "./ai/review.js";
import * as auth from "./auth.js";
import { VERSION } from "./config.js";
import { checkLinterInstallation } from "./detect.js";
import { getStagedFilePaths, init, installHooks, uninstallHooks } from "./git.js";
import {
  ALL_LINTERS,
  postCommitHook,
  preCommit,
  prepareCommitMsg,
  prettifyProject,
  runLint,
} from "./orchestrator.js";
import { findRCFile, loadRC } from "./rc.js";
import type { LintReport, LinterName } from "./types.js";
import { findGitRoot, isCommandAvailable, readLintConfig } from "./utils.js";

const program = new Command();

program
  .name("lint")
  .description("Omnilint — The universal linter with AI-powered code review.")
  .version(VERSION, "-v, --version");

// ── Main lint command (default + with paths) ──

program
  .command("check [paths...]", { isDefault: true })
  .description("Lint files (default: staged files, or specify paths)")
  .option("--fix", "Auto-fix issues where supported")
  .option("--dry-run", "Show what would be fixed without applying")
  .option("-f, --format <format>", "Output format: text, json", "text")
  .option("-q, --quiet", "Minimal output (just summary)")
  .option("--verbose", "Detailed output")
  .option("-T, --truncate", "Truncate to first 10 offenses per file")
  .option("-t, --time", "Show execution time")
  .option("--exit-on-warnings", "Exit with code 2 on warnings")
  .action((paths, options) => {
    runLint({
      paths: paths.length > 0 ? paths : undefined,
      fix: options.fix,
      dryRun: options.dryRun,
      format: options.format,
      quiet: options.quiet,
      verbose: options.verbose,
      truncate: options.truncate,
      time: options.time,
      exitOnWarnings: options.exitOnWarnings,
    });
  });

// ── Git hook commands ──

program
  .command("pre-commit")
  .description("Pre-commit hook: lint staged files")
  .option("--fix", "Auto-fix issues")
  .option("-t, --time", "Show execution time")
  .option("-T, --truncate", "Truncate output")
  .option("-q, --quiet", "Minimal output")
  .action((options) => {
    preCommit({
      fix: options.fix,
      time: options.time ?? true,
      truncate: options.truncate,
      quiet: options.quiet,
    });
  });

program
  .command("prepare-commit-msg")
  .description("Prepare-commit-msg hook")
  .action(() => prepareCommitMsg());

program
  .command("post-commit")
  .description("Post-commit hook")
  .action(() => postCommitHook());

// ── Setup commands ──

program
  .command("init")
  .description("Initialize Omnilint with smart project detection")
  .action(() => init());

program
  .command("install:hooks")
  .description("Install git hooks")
  .action(() => {
    console.log("Installing git hooks...");
    const rc = loadRC();
    installHooks({ timeout: rc.hooks?.timeout, skipEnv: rc.hooks?.skip_env });
  });

program
  .command("uninstall:hooks")
  .description("Remove Omnilint git hooks")
  .action(() => uninstallHooks());

program
  .command("prettify <extension>")
  .description("Run Prettier on all files with the given extension")
  .action((extension) => prettifyProject(extension));

// ── Doctor command ──

program
  .command("doctor")
  .description("Diagnose Omnilint setup and linter health")
  .action(async () => {
    console.log(chalk.cyan.bold("\n  Omnilint Doctor\n"));

    // Git
    const gitRoot = findGitRoot();
    console.log(
      gitRoot ? chalk.green(`  ✓ Git: ${gitRoot}`) : chalk.red("  ✗ Not a git repository"),
    );

    // Config
    const config = readLintConfig();
    if (config?.uuid) {
      const mode = config.uuid.startsWith("local-") ? "offline" : "cloud";
      console.log(chalk.green(`  ✓ Config: .lint/config (${mode})`));
    } else {
      console.log(chalk.yellow("  ✗ No .lint/config — run 'lint init'"));
    }

    // RC file
    const rcFile = findRCFile();
    console.log(
      rcFile
        ? chalk.green(`  ✓ RC: ${rcFile}`)
        : chalk.gray("  - No .lintrc.yaml (using defaults)"),
    );

    // Auth
    console.log(
      auth.isLoggedIn()
        ? chalk.green(`  ✓ Auth: ${auth.getUsername()}`)
        : chalk.gray("  - Not logged in (offline mode)"),
    );

    // Linters
    console.log(chalk.bold("\n  Linters:\n"));
    const allNames: LinterName[] = [
      "biome",
      "oxlint",
      "eslint",
      "prettier",
      "ruff",
      "pylint",
      "rubocop",
      "erblint",
      "brakeman",
      "stylelint",
    ];
    const status = checkLinterInstallation(allNames);
    const rc = loadRC();
    const enabledSet = new Set(rc.linters?.enabled || allNames);
    const disabledSet = new Set(rc.linters?.disabled || []);

    for (const l of status) {
      const isEnabled = enabledSet.has(l.name) && !disabledSet.has(l.name);
      const installed = l.installed ? chalk.green("installed") : chalk.red("not installed");
      const enabled = isEnabled ? "" : chalk.gray(" (disabled in .lintrc.yaml)");
      console.log(`    ${l.installed ? "✓" : "✗"} ${l.name}: ${installed}${enabled}`);
    }

    // Hooks
    console.log(chalk.bold("\n  Git Hooks:\n"));
    if (gitRoot) {
      const nodeFs = await import("node:fs");
      for (const hook of ["pre-commit", "prepare-commit-msg", "post-commit"]) {
        const hookPath = `${gitRoot}/.git/hooks/${hook}`;
        if (nodeFs.existsSync(hookPath)) {
          const content = nodeFs.readFileSync(hookPath, "utf-8");
          const isOmnilint = content.includes("Omnilint") || content.includes("lint");
          console.log(
            isOmnilint
              ? chalk.green(`    ✓ ${hook}`)
              : chalk.yellow(`    ~ ${hook} (not Omnilint)`),
          );
        } else {
          console.log(chalk.gray(`    - ${hook} (not installed)`));
        }
      }
    }

    console.log("");
  });

// ── AI commands ──

const ai = program.command("ai").description("AI-powered code analysis (powered by Claude)");

ai.command("review")
  .description("AI code review of staged changes")
  .action(() => reviewStagedChanges());

ai.command("fix")
  .description("AI-powered auto-fix suggestions")
  .action(() => fixStagedChanges());

ai.command("commit")
  .description("Generate a commit message from staged changes")
  .action(() => printCommitSuggestion());

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
  .description("Configure your Anthropic API key")
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

program.parse();
