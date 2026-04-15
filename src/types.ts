export interface LintConfig {
  uuid: string;
  username?: string;
  repository?: string;
}

export interface UserCredentials {
  username: string;
  password: string;
  email?: string;
}

export interface PolicyRule {
  id: number;
  slug: string;
  name: string;
  status: "enabled" | "disabled";
  severity: "error" | "warning" | "info";
  content?: {
    options?: Record<string, unknown>;
  };
  linter: string;
  rule_options?: RuleOption[];
}

export interface RuleOption {
  slug: string;
  name: string;
  value: string | number | boolean;
}

export interface CommitAttempt {
  id: number;
  sha: string;
  branch: string;
  message?: string;
  repository_id: string;
  policy_id?: number;
}

export interface LintReport {
  linter: string;
  files: FileReport[];
  error_count: number;
  warning_count: number;
  fixable_error_count: number;
  fixable_warning_count: number;
}

export interface FileReport {
  path: string;
  offenses: Offense[];
}

export interface Offense {
  rule: string;
  message: string;
  severity: "error" | "warning" | "info";
  line: number;
  column: number;
  source?: string;
  fixable?: boolean;
}

export interface LinterResult {
  success: boolean;
  report: LintReport;
  raw?: string;
}

export interface Repository {
  id: string;
  uuid: string;
  name: string;
  slug: string;
  policy?: Policy;
  has_autofix: boolean;
}

export interface Policy {
  id: number;
  name: string;
  policy_rules: PolicyRule[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

export interface StagedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

export type LinterName =
  | "eslint"
  | "prettier"
  | "rubocop"
  | "erblint"
  | "brakeman"
  | "stylelint"
  | "pylint"
  | "biome"
  | "ruff"
  | "oxlint";

export interface LinterConfig {
  name: LinterName;
  extensions: string[];
  checkCommand: string;
  installCommand: string;
  configFileName: string;
}

export interface AiReviewResult {
  summary: string;
  issues: AiIssue[];
  suggestions: string[];
}

export interface AiIssue {
  file: string;
  line?: number;
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}

// Unified options for all lint commands
export interface RunOptions {
  // File selection
  paths?: string[];

  // Behavior
  fix?: boolean;
  dryRun?: boolean;

  // Output
  format?: "text" | "json";
  quiet?: boolean;
  verbose?: boolean;
  truncate?: boolean;
  time?: boolean;

  // Hooks
  keep?: boolean;
  exitOnWarnings?: boolean;
}

// Backward compat alias
export type PreCommitOptions = RunOptions;
