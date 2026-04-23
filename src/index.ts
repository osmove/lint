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
import { collectDoctorReport, formatDoctorReport } from "./doctor.js";
import { buildSuggestedLinterPlan, detectProject } from "./detect.js";
import { getStagedFilePaths, init, inspectManagedHooks, uninstallHooks, installHooks } from "./git.js";
import {
  ALL_LINTERS,
  explainRun,
  LINTER_MAP,
  postCommitHook,
  preCommit,
  prepareCommitMsg,
  prettifyProject,
  runLint,
} from "./orchestrator.js";
import { loadRC } from "./rc.js";
import type { LintReport } from "./types.js";
import { findGitRoot } from "./utils.js";

const program = new Command();

program
  .name("lint")
  .description("Lint — The universal linter with AI-powered code review.")
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

program
  .command("explain-run [paths...]")
  .description("Explain file, linter, and policy decisions for a run without linting")
  .option("--json", "Output explanation as JSON")
  .action((paths, options: { json?: boolean }) => {
    explainRun({
      paths: paths.length > 0 ? paths : ["."],
      json: options.json,
    });
  });

program
  .command("ci [paths...]")
  .description("Run a repo-local quality gate for CI or control planes")
  .option("--fix", "Auto-fix issues where supported")
  .option("--dry-run", "Show what would be fixed without applying")
  .option("-f, --format <format>", "Output format: json, text", "json")
  .option("-q, --quiet", "Minimal output (just summary)")
  .option("--verbose", "Detailed output")
  .option("-T, --truncate", "Truncate to first 10 offenses per file")
  .option("-t, --time", "Show execution time")
  .option("--allow-warnings", "Exit 0 when only warnings are found")
  .action((paths, options) => {
    runLint({
      paths: paths.length > 0 ? paths : ["."],
      fix: options.fix,
      dryRun: options.dryRun,
      format: options.format,
      quiet: options.quiet,
      verbose: options.verbose,
      truncate: options.truncate,
      time: options.time,
      exitOnWarnings: !options.allowWarnings,
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
  .description("Initialize Lint with smart project detection")
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
  .command("install:missing [paths...]")
  .description("Install missing linters suggested for this project")
  .option("--dry-run", "Show the missing linters without installing them")
  .action((paths, options: { dryRun?: boolean }) => {
    const root = findGitRoot() || process.cwd();
    const project = detectProject(root);
    const plan = buildSuggestedLinterPlan(project);
    const missing = plan.filter((entry) => !entry.installed);

    if (missing.length === 0) {
      console.log(chalk.green("No suggested linters are missing."));
      return;
    }

    console.log(chalk.bold("\n  Missing Suggested Linters\n"));
    for (const entry of missing) {
      console.log(`  - ${entry.name}`);
      if (entry.reasons.length > 0) {
        console.log(chalk.gray(`    ${entry.reasons.join(", ")}`));
      }
    }
    console.log("");

    if (options.dryRun) {
      return;
    }

    for (const entry of missing) {
      const linter = LINTER_MAP.get(entry.name);
      if (!linter) continue;
      linter.install();
    }
  });

program
  .command("uninstall:hooks")
  .description("Remove Lint git hooks")
  .action(() => uninstallHooks());

program
  .command("hooks:status")
  .description("Inspect Lint git hooks")
  .option("--json", "Output hook status as JSON")
  .action((options: { json?: boolean }) => {
    const gitRoot = findGitRoot();
    if (!gitRoot) {
      console.log(chalk.red("Not inside a git repository."));
      return;
    }

    const hooks = inspectManagedHooks(gitRoot);
    if (options.json) {
      console.log(JSON.stringify(hooks, null, 2));
      return;
    }

    console.log(chalk.bold("\n  Lint Hooks\n"));
    for (const hook of hooks) {
      const status = !hook.exists
        ? chalk.gray("missing")
        : hook.managed
          ? chalk.green("managed")
          : chalk.yellow("unmanaged");
      console.log(`  ${hook.name}: ${status}`);
      if (hook.exists) {
        console.log(chalk.gray(`    ${hook.hookPath}`));
      }
    }
    console.log("");
  });

program
  .command("prettify <extension>")
  .description("Run Prettier on all files with the given extension")
  .action((extension) => prettifyProject(extension));

// ── Doctor command ──

program
  .command("doctor")
  .description("Diagnose Lint setup and linter health")
  .option("--json", "Output doctor status as JSON")
  .action(async (options: { json?: boolean }) => {
    const report = collectDoctorReport();
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(chalk.cyan.bold(""));
    for (const line of formatDoctorReport(report)) {
      console.log(line);
    }
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
  .description("Sign in to Lint")
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
  .description("Sign out from Lint")
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
  .description("Create a Lint account")
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
