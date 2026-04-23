import { pathToFileURL } from "node:url";
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
import { buildSuggestedLinterPlan, detectProject } from "./detect.js";
import { collectDoctorReport, formatDoctorReport } from "./doctor.js";
import {
  bootstrapProject,
  fixSetup,
  getStagedFilePaths,
  init,
  inspectManagedHooks,
  installHooks,
  uninstallHooks,
} from "./git.js";
import {
  ALL_LINTERS,
  LINTER_MAP,
  explainRun,
  formatProjectFiles,
  machineSummary,
  postCommitHook,
  preCommit,
  prepareCommitMsg,
  runLint,
} from "./orchestrator.js";
import { buildRecommendedRC, formatRC, loadRC, writeRC } from "./rc.js";
import { LINT_JSON_SCHEMA_VERSION } from "./reporter.js";
import type { LintReport } from "./types.js";
import { findGitRoot } from "./utils.js";

const program = new Command();

program
  .name("lint")
  .description("Lint — The universal linter with AI-powered code review.")
  .version(VERSION, "-v, --version");

function addHiddenCommand(command: Command): void {
  program.addCommand(command, { hidden: true });
}

function addLegacyAlias(
  name: string,
  description: string,
  configure: (command: Command) => Command,
): void {
  addHiddenCommand(configure(new Command(name).description(description)));
}

function withJsonOption(command: Command, description: string): Command {
  return command.option("--json", description);
}

function withBootstrapOptions(command: Command): Command {
  return command
    .option("--dry-run", "Preview the bootstrap plan without writing files")
    .option("--json", "Output the bootstrap plan as JSON")
    .option("--install-missing", "Install suggested missing linters")
    .option("--install-hooks", "Install managed git hooks");
}

function withSetupFixOptions(command: Command): Command {
  return command
    .option("--dry-run", "Preview the setup changes without writing files")
    .option("--json", "Output the setup plan as JSON")
    .option("--no-install-missing", "Skip installing missing suggested linters")
    .option("--no-install-hooks", "Skip installing managed git hooks");
}

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

function installManagedHooks(): void {
  console.log("Installing git hooks...");
  const rc = loadRC();
  installHooks({ timeout: rc.hooks?.timeout, skipEnv: rc.hooks?.skip_env });
}

function runPreCommitHook(options: {
  fix?: boolean;
  time?: boolean;
  truncate?: boolean;
  quiet?: boolean;
}): void {
  preCommit({
    fix: options.fix,
    time: options.time ?? true,
    truncate: options.truncate,
    quiet: options.quiet,
  });
}

function runPrepareCommitMsgHook(): void {
  prepareCommitMsg();
}

function runPostCommitCommand(): void {
  postCommitHook();
}

function runMachineSummary(paths: string[], options: { strict?: boolean }): void {
  const doctor = collectDoctorReport();
  machineSummary({
    paths: paths.length > 0 ? paths : ["."],
    doctorStatus: doctor.status,
    missingSelectedLinters: doctor.summary.missingSelectedLinters,
    strict: options.strict,
  });
}

function runSetupFix(options: {
  dryRun?: boolean;
  json?: boolean;
  installMissing?: boolean;
  installHooks?: boolean;
}): void {
  fixSetup({
    dryRun: options.dryRun,
    json: options.json,
    installMissing: options.installMissing,
    installHooks: options.installHooks,
  });
}

function runSetupBootstrap(options: {
  dryRun?: boolean;
  json?: boolean;
  installMissing?: boolean;
  installHooks?: boolean;
}): void {
  bootstrapProject({
    dryRun: options.dryRun,
    json: options.json,
    installMissing: options.installMissing,
    installHooks: options.installHooks,
  });
}

function runDoctor(options: { json?: boolean }): void {
  const report = collectDoctorReport();
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.cyan.bold(""));
  for (const line of formatDoctorReport(report)) {
    console.log(line);
  }
}

function runExplainRun(paths: string[], options: { json?: boolean }): void {
  explainRun({
    paths: paths.length > 0 ? paths : ["."],
    json: options.json,
  });
}

function runRecommendedConfig(options: { json?: boolean; write?: boolean }): void {
  const project = detectProject(findGitRoot() || process.cwd());
  const suggested = buildSuggestedLinterPlan(project).map((entry) => entry.name);
  const existing = loadRC();
  const recommended = buildRecommendedRC(existing, suggested);

  if (options.write) {
    writeRC(recommended);
    console.log(chalk.green("Wrote recommended .lintrc.yaml"));
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          schema_version: LINT_JSON_SCHEMA_VERSION,
          kind: "lint_recommended_config",
          suggested_linters: suggested,
          recommended,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(chalk.cyan.bold("\n  Recommended .lintrc.yaml\n"));
  console.log(formatRC(recommended));
}

function runInstallMissing(paths: string[], options: { dryRun?: boolean }): void {
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
}

function printHooksStatus(options: { json?: boolean }): void {
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
}

async function runLogin(): Promise<void> {
  if (auth.isLoggedIn()) {
    console.log(`Already logged in as ${chalk.green(auth.getUsername())}.`);
    return;
  }
  const username = await input({ message: "Username or email:" });
  const pw = await password({ message: "Password:", mask: "*" });
  await auth.login(username, pw);
}

async function runLogout(): Promise<void> {
  if (!auth.isLoggedIn()) {
    console.log("Not logged in.");
    return;
  }
  const yes = await confirm({ message: "Are you sure you want to log out?" });
  if (yes) auth.logout();
}

async function runSignup(): Promise<void> {
  if (auth.isLoggedIn()) {
    console.log(`Already logged in as ${chalk.green(auth.getUsername())}.`);
    return;
  }
  const username = await input({ message: "Username:" });
  const email = await input({ message: "Email:" });
  const pw = await password({ message: "Password:", mask: "*" });
  await auth.signup(username, email, pw);
}

function runAuthStatus(): void {
  auth.printStatus();
}

function runFormatWrite(extension: string): void {
  formatProjectFiles(extension);
}

addHiddenCommand(
  new Command("pre-commit")
    .description("Pre-commit hook: lint staged files")
    .option("--fix", "Auto-fix issues")
    .option("-t, --time", "Show execution time")
    .option("-T, --truncate", "Truncate output")
    .option("-q, --quiet", "Minimal output")
    .action((options) => runPreCommitHook(options)),
);

addHiddenCommand(
  new Command("prepare-commit-msg")
    .description("Prepare-commit-msg hook")
    .action(() => runPrepareCommitMsgHook()),
);

addHiddenCommand(
  new Command("post-commit").description("Post-commit hook").action(() => runPostCommitCommand()),
);

const hooksCommand = program.command("hooks").description("Manage Lint git hooks");

hooksCommand
  .command("install")
  .description("Install git hooks")
  .action(() => installManagedHooks());

hooksCommand
  .command("uninstall")
  .description("Remove Lint git hooks")
  .action(() => uninstallHooks());

hooksCommand
  .command("status")
  .description("Inspect Lint git hooks")
  .option("--json", "Output hook status as JSON")
  .action((options: { json?: boolean }) => printHooksStatus(options));

const setupCommand = program.command("setup").description("Manage repo-local Lint setup");

setupCommand
  .command("init")
  .description("Initialize Lint with smart project detection")
  .action(() => init());

const setupBootstrapCommand = withBootstrapOptions(
  setupCommand
    .command("bootstrap")
    .description("Bootstrap repo-local Lint config without interactive prompts"),
);

setupBootstrapCommand.action(
  (options: {
    dryRun?: boolean;
    json?: boolean;
    installMissing?: boolean;
    installHooks?: boolean;
  }) => runSetupBootstrap(options),
);

const setupFixCommand = withSetupFixOptions(
  setupCommand.command("fix").description("Apply recommended repo-local Lint setup in one pass"),
);

setupFixCommand.action(
  (options: {
    dryRun?: boolean;
    json?: boolean;
    installMissing?: boolean;
    installHooks?: boolean;
  }) => runSetupFix(options),
);

setupCommand
  .command("doctor")
  .description("Diagnose Lint setup and linter health")
  .option("--json", "Output doctor status as JSON")
  .action((options: { json?: boolean }) => runDoctor(options));

const configCommand = program.command("config").description("Manage Lint configuration helpers");

configCommand
  .command("recommend")
  .description("Show or write a recommended .lintrc.yaml for this project")
  .option("--json", "Output the recommendation as JSON")
  .option("--write", "Write the recommended config to .lintrc.yaml")
  .action((options: { json?: boolean; write?: boolean }) => runRecommendedConfig(options));

const installCommand = program.command("install").description("Install Lint-related tooling");

installCommand
  .command("missing [paths...]")
  .description("Install missing linters suggested for this project")
  .option("--dry-run", "Show the missing linters without installing them")
  .action((paths, options: { dryRun?: boolean }) => runInstallMissing(paths, options));

const machineCommand = program
  .command("machine")
  .description("Machine-readable Lint output helpers");

machineCommand
  .command("summary [paths...]")
  .description("Output a compact machine-readable repo summary for automation consumers")
  .option("--strict", "Exit 1 when the repo still needs setup or has uncovered files")
  .action((paths, options: { strict?: boolean }) => runMachineSummary(paths, options));

const explainCommand = program
  .command("explain")
  .description("Explain Lint decisions and behavior");

explainCommand
  .command("run [paths...]")
  .description("Explain file, linter, and policy decisions for a run without linting")
  .option("--json", "Output explanation as JSON")
  .action((paths, options: { json?: boolean }) => runExplainRun(paths, options));

const authCommand = program.command("auth").description("Manage Lint authentication");

authCommand
  .command("status")
  .description("Show current login status")
  .action(() => runAuthStatus());

authCommand
  .command("login")
  .description("Sign in to Lint")
  .action(async () => runLogin());

authCommand
  .command("logout")
  .description("Sign out from Lint")
  .action(async () => runLogout());

authCommand
  .command("signup")
  .description("Create a Lint account")
  .action(async () => runSignup());

authCommand.addCommand(
  new Command("whoami")
    .description("Legacy alias for 'lint auth status'")
    .action(() => runAuthStatus()),
  { hidden: true },
);

const formatCommand = program.command("format").description("Formatting helpers");

formatCommand
  .command("write <extension>")
  .description("Run Prettier on all files with the given extension")
  .action((extension) => runFormatWrite(extension));

addLegacyAlias("init", "Legacy alias for 'lint setup init'", (command) =>
  command.action(() => init()),
);

addLegacyAlias("explain-run [paths...]", "Legacy alias for 'lint explain run'", (command) =>
  withJsonOption(command, "Output explanation as JSON").action(
    (paths, options: { json?: boolean }) => runExplainRun(paths, options),
  ),
);

addLegacyAlias("install:hooks", "Legacy alias for 'lint hooks install'", (command) =>
  command.action(() => installManagedHooks()),
);

addLegacyAlias("machine:summary [paths...]", "Legacy alias for 'lint machine summary'", (command) =>
  command
    .option("--strict", "Exit 1 when the repo still needs setup or has uncovered files")
    .action((paths, options: { strict?: boolean }) => runMachineSummary(paths, options)),
);

addLegacyAlias("bootstrap", "Legacy alias for 'lint setup bootstrap'", (command) =>
  withBootstrapOptions(command).action(
    (options: {
      dryRun?: boolean;
      json?: boolean;
      installMissing?: boolean;
      installHooks?: boolean;
    }) => runSetupBootstrap(options),
  ),
);

addLegacyAlias("setup:fix", "Legacy alias for 'lint setup fix'", (command) =>
  withSetupFixOptions(command).action(
    (options: {
      dryRun?: boolean;
      json?: boolean;
      installMissing?: boolean;
      installHooks?: boolean;
    }) => runSetupFix(options),
  ),
);

addLegacyAlias("config:recommend", "Legacy alias for 'lint config recommend'", (command) =>
  withJsonOption(command, "Output the recommendation as JSON")
    .option("--write", "Write the recommended config to .lintrc.yaml")
    .action((options: { json?: boolean; write?: boolean }) => runRecommendedConfig(options)),
);

addLegacyAlias("doctor", "Legacy alias for 'lint setup doctor'", (command) =>
  withJsonOption(command, "Output doctor status as JSON").action((options: { json?: boolean }) =>
    runDoctor(options),
  ),
);

addLegacyAlias("install:missing [paths...]", "Legacy alias for 'lint install missing'", (command) =>
  command
    .option("--dry-run", "Show the missing linters without installing them")
    .action((paths, options: { dryRun?: boolean }) => runInstallMissing(paths, options)),
);

addLegacyAlias("uninstall:hooks", "Legacy alias for 'lint hooks uninstall'", (command) =>
  command.action(() => uninstallHooks()),
);

addLegacyAlias("hooks:status", "Legacy alias for 'lint hooks status'", (command) =>
  withJsonOption(command, "Output hook status as JSON").action((options: { json?: boolean }) =>
    printHooksStatus(options),
  ),
);

addLegacyAlias("login", "Legacy alias for 'lint auth login'", (command) =>
  command.action(async () => runLogin()),
);

addLegacyAlias("logout", "Legacy alias for 'lint auth logout'", (command) =>
  command.action(async () => runLogout()),
);

addLegacyAlias("signup", "Legacy alias for 'lint auth signup'", (command) =>
  command.action(async () => runSignup()),
);

addLegacyAlias("whoami", "Legacy alias for 'lint auth whoami'", (command) =>
  command.action(() => runAuthStatus()),
);

addLegacyAlias(
  "prettify <extension>",
  "Legacy alias for 'lint format write <extension>'",
  (command) => command.action((extension) => runFormatWrite(extension)),
);

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

const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(entryArg).href) {
  program.parse();
}

export { program };
