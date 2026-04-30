import createOpenApiClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/openapi-types.js";

export type { paths } from "./generated/openapi-types.js";
export type { components, operations } from "./generated/openapi-types.js";

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
