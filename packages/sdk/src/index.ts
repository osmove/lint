import createOpenApiClient, { type Client, type ClientOptions } from "openapi-fetch";

// Generated types — placeholder until `pnpm --filter @osmove/lint-sdk openapi:types`
// runs against the published spec at api.lint.to/openapi/v1.yaml. The empty
// `paths` shape keeps the client typed-but-permissive in the meantime.
export interface paths {}

export interface CreateLintClientOptions extends ClientOptions {
  baseUrl?: string;
  token?: string;
}

const DEFAULT_BASE_URL = "https://api.lint.to";

export type LintClient = Client<paths>;

export function createLintClient(options: CreateLintClientOptions = {}): LintClient {
  const { token, baseUrl, ...rest } = options;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return createOpenApiClient<paths>({
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
    headers,
    ...rest,
  });
}

export type { Client, ClientOptions } from "openapi-fetch";
