import * as auth from "./auth.js";
import { checkLinterInstallation, detectProject, getAllSuggestedLinters } from "./detect.js";
import { getCurrentBranch, inspectManagedHooks } from "./git.js";
import { autoResolveConflicts, findRCFile, loadRC, resolveEnabledLinters } from "./rc.js";
import { LINT_JSON_SCHEMA_VERSION } from "./reporter.js";
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
  selected: boolean;
  source: "rc" | "auto";
}

export interface DoctorProjectLanguage {
  name: string;
  reason: string;
  suggestedLinters: LinterName[];
}

export interface DoctorReport {
  schema_version?: string;
  kind?: string;
  status: "healthy" | "needs_setup";
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
    hasLintConfig: boolean;
  };
  project: {
    languages: DoctorProjectLanguage[];
    frameworks: string[];
    packageManagers: string[];
    suggestedLinters: LinterName[];
    hasHusky: boolean;
    hasLefthook: boolean;
  };
  linters: DoctorLinterStatus[];
  hooks: DoctorHookStatus[];
  summary: {
    installedLinters: number;
    enabledLinters: number;
    selectedLinters: number;
    missingSelectedLinters: LinterName[];
    managedHooks: number;
  };
}

export function collectDoctorReport(): DoctorReport {
  const gitRoot = findGitRoot();
  const branch = gitRoot ? getCurrentBranch() : null;
  const dirty = gitRoot ? repoIsDirty(gitRoot) : null;
  const project = detectProject(gitRoot || process.cwd());

  const config = readLintConfig();
  const rcFile = findRCFile();
  const rc = loadRC();
  const installedLinters = checkLinterInstallation(ALL_LINTERS);
  const installedNames = installedLinters
    .filter((linter) => linter.installed)
    .map((linter) => linter.name);
  // Restrict auto-mode to linters that match the detected project, so a
  // globally-installed Ruby linter is not auto-selected on a TS-only repo.
  const projectApplicable = getAllSuggestedLinters(project);
  const projectApplicableSet = new Set(projectApplicable);
  const enabledNames = rc.linters?.enabled
    ? rc.linters.enabled
    : rc.linters?.disabled
      ? projectApplicable.filter((name) => !rc.linters?.disabled?.includes(name))
      : autoResolveConflicts(projectApplicable);
  const selectedNames = resolveEnabledLinters(
    rc,
    installedNames.filter((name) => projectApplicableSet.has(name)),
  );
  const enabledSet = new Set(enabledNames);
  const disabledSet = new Set(rc.linters?.disabled || []);
  const selectedSet = new Set(selectedNames);
  const source: DoctorLinterStatus["source"] =
    rc.linters?.enabled || rc.linters?.disabled ? "rc" : "auto";

  const linters = installedLinters.map((linter) => ({
    name: linter.name,
    installed: linter.installed,
    enabled: enabledSet.has(linter.name) && !disabledSet.has(linter.name),
    selected: selectedSet.has(linter.name),
    source,
  }));

  const hooks = gitRoot
    ? inspectManagedHooks(gitRoot).map((hook) => ({
        name: hook.name,
        exists: hook.exists,
        managed: hook.managed,
        hookPath: hook.hookPath,
      }))
    : [];
  const missingSelectedLinters = linters
    .filter((linter) => linter.enabled && !linter.installed)
    .map((linter) => linter.name);
  const managedHooks = hooks.filter((hook) => hook.exists && hook.managed).length;
  const status =
    gitRoot && (config?.uuid || rcFile) && missingSelectedLinters.length === 0
      ? "healthy"
      : "needs_setup";

  return {
    schema_version: LINT_JSON_SCHEMA_VERSION,
    kind: "lint_doctor",
    status,
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
      hasLintConfig: Boolean(config?.uuid),
    },
    project: {
      languages: project.languages,
      frameworks: project.frameworks,
      packageManagers: project.packageManagers,
      suggestedLinters: getAllSuggestedLinters(project),
      hasHusky: project.hasHusky,
      hasLefthook: project.hasLefthook,
    },
    linters,
    hooks,
    summary: {
      installedLinters: linters.filter((linter) => linter.installed).length,
      enabledLinters: linters.filter((linter) => linter.enabled).length,
      selectedLinters: linters.filter((linter) => linter.selected).length,
      missingSelectedLinters,
      managedHooks,
    },
  };
}

export function formatDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = [];

  lines.push("  Lint Doctor");
  lines.push("");
  lines.push(`  Status: ${report.status}`);
  lines.push("");

  if (report.git.root) {
    lines.push(`  ✓ Git: ${report.git.root}`);
    const dirtyLabel = report.git.dirty === null ? "unknown" : report.git.dirty ? "dirty" : "clean";
    lines.push(`  ✓ Branch: ${report.git.branch || "unknown"} (${dirtyLabel})`);
  } else {
    lines.push("  ✗ Not a git repository");
  }

  if (report.config.initialized) {
    lines.push(`  ✓ Config: .lint/config (${report.config.mode})`);
  } else {
    lines.push("  ✗ No .lint/config — run 'lint setup init'");
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
  lines.push("  Project:");
  lines.push("");
  if (report.project.languages.length === 0) {
    lines.push("    - No languages detected");
  } else {
    for (const language of report.project.languages) {
      const linters =
        language.suggestedLinters.length > 0 ? ` -> ${language.suggestedLinters.join(", ")}` : "";
      lines.push(`    ✓ ${language.name} (${language.reason})${linters}`);
    }
  }
  if (report.project.frameworks.length > 0) {
    lines.push(`    Frameworks: ${report.project.frameworks.join(", ")}`);
  }
  if (report.project.packageManagers.length > 0) {
    lines.push(`    Package managers: ${report.project.packageManagers.join(", ")}`);
  }
  if (report.project.hasHusky || report.project.hasLefthook) {
    lines.push(
      `    Hook managers: ${[
        report.project.hasHusky ? "husky" : null,
        report.project.hasLefthook ? "lefthook" : null,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  lines.push("");
  lines.push("  Linters:");
  lines.push("");
  for (const linter of report.linters) {
    const enabled = linter.enabled
      ? ""
      : linter.source === "rc"
        ? " (disabled in .lintrc.yaml)"
        : " (auto-disabled)";
    const selected = linter.selected ? " [selected]" : "";
    lines.push(
      `    ${linter.installed ? "✓" : "✗"} ${linter.name}: ${linter.installed ? "installed" : "not installed"}${enabled}${selected}`,
    );
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

  if (report.summary.missingSelectedLinters.length > 0) {
    lines.push("");
    lines.push(`  Missing selected linters: ${report.summary.missingSelectedLinters.join(", ")}`);
  }

  lines.push("");
  return lines;
}
