import { API_BASE_URL } from "./config.js";
import type { ApiResponse, CommitAttempt, Policy, Repository } from "./types.js";

async function request<T>(
  endpoint: string,
  options: { method?: string; body?: Record<string, unknown>; token?: string } = {},
): Promise<ApiResponse<T>> {
  const url = new URL(endpoint, API_BASE_URL);
  if (options.token) {
    url.searchParams.set("user_token", options.token);
  }

  try {
    const response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
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

export async function login(
  username: string,
  password: string,
): Promise<ApiResponse<{ username: string; authentication_token: string }>> {
  return request("/users/sign_in.json", {
    method: "POST",
    body: {
      user: { login: username, password },
    },
  });
}

export async function signup(
  username: string,
  email: string,
  password: string,
): Promise<ApiResponse<{ username: string; authentication_token: string }>> {
  return request("/users.json", {
    method: "POST",
    body: {
      user: { username, email, password },
    },
  });
}

export async function fetchUser(
  username: string,
  token: string,
): Promise<ApiResponse<{ username: string; email: string }>> {
  return request(`/${username}.json`, { token });
}

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
  const url = `/${username}/repositories.json`;
  const fullUrl = new URL(url, API_BASE_URL);
  fullUrl.searchParams.set("user_token", token);
  fullUrl.searchParams.set("slug", slug);
  return request(fullUrl.pathname + fullUrl.search);
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
    body: {
      repository: { name, policy, has_autofix: hasAutofix },
    },
  });
}

export async function fetchPolicy(repositoryUUID: string, token: string): Promise<ApiResponse<Policy>> {
  return request(`/${repositoryUUID}/policy.json`, { token });
}

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
    body: {
      commit_attempt: { sha, branch, message },
    },
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
