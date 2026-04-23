import * as auth from "./auth.js";
import { checkLinterInstallation } from "./detect.js";
import { getCurrentBranch, inspectManagedHooks } from "./git.js";
import { findRCFile, loadRC } from "./rc.js";
import type { LinterName } from "./types.js";
import { findGitRoot, readLintConfig, repoIsDirty } from "./utils.js";

const ALL_LINTERS: LinterName[] = [
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

export interface DoctorHookStatus {
  name: string;
  exists: boolean;
  managed: boolean;
  hookPath: string;
}

export interface DoctorLinterStatus {
  name: LinterName;
  installed: boolean;
  enabled: boolean;
}

export interface DoctorReport {
  git: {
    root: string | null;
    branch: string | null;
    dirty: boolean | null;
  };
  config: {
    initialized: boolean;
    mode: "offline" | "cloud" | null;
    rcFile: string | null;
    loggedIn: boolean;
    username: string | null;
  };
  linters: DoctorLinterStatus[];
  hooks: DoctorHookStatus[];
}

export function collectDoctorReport(): DoctorReport {
  const gitRoot = findGitRoot();
  const branch = gitRoot ? getCurrentBranch() : null;
  const dirty = gitRoot ? repoIsDirty(gitRoot) : null;

  const config = readLintConfig();
  const rcFile = findRCFile();
  const rc = loadRC();
  const enabledSet = new Set(rc.linters?.enabled || ALL_LINTERS);
  const disabledSet = new Set(rc.linters?.disabled || []);

  const linters = checkLinterInstallation(ALL_LINTERS).map((linter) => ({
    name: linter.name,
    installed: linter.installed,
    enabled: enabledSet.has(linter.name) && !disabledSet.has(linter.name),
  }));

  const hooks = gitRoot
    ? inspectManagedHooks(gitRoot).map((hook) => ({
        name: hook.name,
        exists: hook.exists,
        managed: hook.managed,
        hookPath: hook.hookPath,
      }))
    : [];

  return {
    git: {
      root: gitRoot,
      branch,
      dirty,
    },
    config: {
      initialized: Boolean(config?.uuid),
      mode: config?.uuid ? (config.uuid.startsWith("local-") ? "offline" : "cloud") : null,
      rcFile,
      loggedIn: auth.isLoggedIn(),
      username: auth.getUsername(),
    },
    linters,
    hooks,
  };
}

export function formatDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = [];

  lines.push("  Lint Doctor");
  lines.push("");

  if (report.git.root) {
    lines.push(`  ✓ Git: ${report.git.root}`);
    const dirtyLabel =
      report.git.dirty === null ? "unknown" : report.git.dirty ? "dirty" : "clean";
    lines.push(`  ✓ Branch: ${report.git.branch || "unknown"} (${dirtyLabel})`);
  } else {
    lines.push("  ✗ Not a git repository");
  }

  if (report.config.initialized) {
    lines.push(`  ✓ Config: .lint/config (${report.config.mode})`);
  } else {
    lines.push("  ✗ No .lint/config — run 'lint init'");
  }

  lines.push(
    report.config.rcFile
      ? `  ✓ RC: ${report.config.rcFile}`
      : "  - No .lintrc.yaml (using defaults)",
  );

  lines.push(
    report.config.loggedIn && report.config.username
      ? `  ✓ Auth: ${report.config.username}`
      : "  - Not logged in (offline mode)",
  );

  lines.push("");
  lines.push("  Linters:");
  lines.push("");
  for (const linter of report.linters) {
    const enabled = linter.enabled ? "" : " (disabled in .lintrc.yaml)";
    lines.push(`    ${linter.installed ? "✓" : "✗"} ${linter.name}: ${linter.installed ? "installed" : "not installed"}${enabled}`);
  }

  lines.push("");
  lines.push("  Git Hooks:");
  lines.push("");
  for (const hook of report.hooks) {
    if (!hook.exists) {
      lines.push(`    - ${hook.name} (not installed)`);
    } else if (hook.managed) {
      lines.push(`    ✓ ${hook.name}`);
    } else {
      lines.push(`    ~ ${hook.name} (not Lint)`);
    }
  }

  lines.push("");
  return lines;
}
