import { z } from "zod";

export const LinterNameSchema = z.enum([
  "eslint",
  "prettier",
  "rubocop",
  "erblint",
  "brakeman",
  "stylelint",
  "pylint",
  "biome",
  "ruff",
  "oxlint",
]);
export type LinterName = z.infer<typeof LinterNameSchema>;

export const SeveritySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const OffenseSchema = z.object({
  rule: z.string(),
  message: z.string(),
  severity: SeveritySchema,
  line: z.number(),
  column: z.number(),
  source: z.string().optional(),
  fixable: z.boolean().optional(),
});
export type Offense = z.infer<typeof OffenseSchema>;

export const FileReportSchema = z.object({
  path: z.string(),
  offenses: z.array(OffenseSchema),
});
export type FileReport = z.infer<typeof FileReportSchema>;

export const LintReportSchema = z.object({
  linter: z.string(),
  files: z.array(FileReportSchema),
  error_count: z.number(),
  warning_count: z.number(),
  fixable_error_count: z.number(),
  fixable_warning_count: z.number(),
});
export type LintReport = z.infer<typeof LintReportSchema>;

export const LinterResultSchema = z.object({
  success: z.boolean(),
  report: LintReportSchema,
  raw: z.string().optional(),
});
export type LinterResult = z.infer<typeof LinterResultSchema>;

export const LinterConfigSchema = z.object({
  name: LinterNameSchema,
  extensions: z.array(z.string()),
  checkCommand: z.string(),
  installCommand: z.string(),
  configFileName: z.string(),
});
export type LinterConfig = z.infer<typeof LinterConfigSchema>;

export const RuleOptionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type RuleOption = z.infer<typeof RuleOptionSchema>;

export const PolicyRuleSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["enabled", "disabled"]),
  severity: SeveritySchema,
  content: z.object({ options: z.record(z.unknown()).optional() }).optional(),
  linter: z.string(),
  rule_options: z.array(RuleOptionSchema).optional(),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicySchema = z.object({
  id: z.number(),
  name: z.string(),
  policy_rules: z.array(PolicyRuleSchema),
});
export type Policy = z.infer<typeof PolicySchema>;

export const RepositorySchema = z.object({
  id: z.string(),
  uuid: z.string(),
  name: z.string(),
  slug: z.string(),
  policy: PolicySchema.optional(),
  has_autofix: z.boolean(),
});
export type Repository = z.infer<typeof RepositorySchema>;

export const CommitAttemptSchema = z.object({
  id: z.number(),
  sha: z.string(),
  branch: z.string(),
  message: z.string().optional(),
  repository_id: z.string(),
  policy_id: z.number().optional(),
});
export type CommitAttempt = z.infer<typeof CommitAttemptSchema>;

export const StagedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
});
export type StagedFile = z.infer<typeof StagedFileSchema>;

export const LintConfigSchema = z.object({
  uuid: z.string(),
  username: z.string().optional(),
  repository: z.string().optional(),
});
export type LintConfig = z.infer<typeof LintConfigSchema>;

export const UserCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
  email: z.string().optional(),
});
export type UserCredentials = z.infer<typeof UserCredentialsSchema>;

export const RunOptionsSchema = z.object({
  paths: z.array(z.string()).optional(),
  fix: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  format: z.enum(["text", "json"]).optional(),
  quiet: z.boolean().optional(),
  verbose: z.boolean().optional(),
  truncate: z.boolean().optional(),
  time: z.boolean().optional(),
  keep: z.boolean().optional(),
  exitOnWarnings: z.boolean().optional(),
});
export type RunOptions = z.infer<typeof RunOptionsSchema>;

export type PreCommitOptions = RunOptions;

export const AiIssueSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  severity: SeveritySchema,
  message: z.string(),
  suggestion: z.string().optional(),
});
export type AiIssue = z.infer<typeof AiIssueSchema>;

export const AiReviewResultSchema = z.object({
  summary: z.string(),
  issues: z.array(AiIssueSchema),
  suggestions: z.array(z.string()),
});
export type AiReviewResult = z.infer<typeof AiReviewResultSchema>;

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}
