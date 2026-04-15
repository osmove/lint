import { API_BASE_URL } from "./config.js";
import type { ApiResponse, CommitAttempt, LintReport, Policy, Repository } from "./types.js";

// ── HTTP client with Bearer auth ──

async function request<T>(
  endpoint: string,
  options: { method?: string; body?: Record<string, unknown>; token?: string } = {},
): Promise<ApiResponse<T>> {
  const url = new URL(endpoint, API_BASE_URL);

  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      return { error: text || response.statusText, status: response.status };
    }

    const data = (await response.json()) as T;
    return { data, status: response.status };
  } catch (error) {
    return { error: (error as Error).message, status: 0 };
  }
}

// ── Auth endpoints ──

export async function login(
  username: string,
  password: string,
): Promise<ApiResponse<{ username: string; authentication_token: string }>> {
  return request("/users/sign_in.json", {
    method: "POST",
    body: { user: { login: username, password } },
  });
}

export async function signup(
  username: string,
  email: string,
  password: string,
): Promise<ApiResponse<{ username: string; authentication_token: string }>> {
  return request("/users.json", {
    method: "POST",
    body: { user: { username, email, password } },
  });
}

export async function fetchUser(
  username: string,
  token: string,
): Promise<ApiResponse<{ username: string; email: string }>> {
  return request(`/${username}.json`, { token });
}

// ── Repository endpoints ──

export async function fetchRepository(
  username: string,
  slug: string,
  token: string,
): Promise<ApiResponse<Repository>> {
  return request(`/${username}/${slug}.json`, { token });
}

export async function searchRepository(
  username: string,
  slug: string,
  token: string,
): Promise<ApiResponse<Repository>> {
  const url = `/${username}/repositories.json?slug=${encodeURIComponent(slug)}`;
  return request(url, { token });
}

export async function createRepository(
  username: string,
  token: string,
  name: string,
  policy: string,
  hasAutofix: boolean,
): Promise<ApiResponse<Repository>> {
  return request(`/${username}/repositories.json`, {
    method: "POST",
    token,
    body: { repository: { name, policy, has_autofix: hasAutofix } },
  });
}

// ── Policy endpoints ──

export async function fetchPolicy(
  repositoryUUID: string,
  token: string,
): Promise<ApiResponse<Policy>> {
  return request(`/${repositoryUUID}/policy.json`, { token });
}

// ── API v1 endpoints (new backend) ──

export async function submitLintResults(
  token: string,
  payload: {
    commit_attempt_id?: number;
    repository_uuid: string;
    policy_check: {
      error_count: number;
      warning_count: number;
      linters: Array<{ name: string; error_count: number; warning_count: number }>;
    };
  },
): Promise<ApiResponse<{ success: boolean }>> {
  return request("/api/v1/lint", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function submitAiReview(
  token: string,
  violations: Array<{
    rule_name: string;
    file_path: string;
    line: number;
    message: string;
    source_code?: string;
  }>,
): Promise<ApiResponse<{ review: string; suggestions: string[] }>> {
  return request("/api/v1/review", {
    method: "POST",
    token,
    body: { violations },
  });
}

export async function getRecommendations(
  repositoryUUID: string,
  token: string,
): Promise<ApiResponse<{ recommendations: Array<{ rule: string; reason: string }> }>> {
  return request(`/api/v1/repositories/${repositoryUUID}/recommend`, {
    method: "POST",
    token,
  });
}

export async function generatePolicy(
  token: string,
  description: string,
  language: string,
): Promise<ApiResponse<{ policy: { name: string; rules: Record<string, unknown>[] } }>> {
  return request("/api/v1/policies/generate", {
    method: "POST",
    token,
    body: { description, language },
  });
}

// ── Legacy endpoints (backward compat) ──

export async function createCommitAttempt(
  repositoryUUID: string,
  token: string,
  sha: string,
  branch: string,
  message?: string,
): Promise<ApiResponse<CommitAttempt>> {
  return request(`/${repositoryUUID}/commit_attempts.json`, {
    method: "POST",
    token,
    body: { commit_attempt: { sha, branch, message } },
  });
}

export async function postReport(
  token: string,
  report: Record<string, unknown>,
): Promise<ApiResponse<{ success: boolean }>> {
  return request("/policy_checks.json", {
    method: "POST",
    token,
    body: { policy_check: report },
  });
}
