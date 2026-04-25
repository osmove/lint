import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let server: FastifyInstance;
let dbPath: string;

beforeEach(async () => {
  dbPath = join(tmpdir(), `lint-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.LINT_SERVER_DB_PATH = dbPath;
  // Reset the module cache so the singleton db connection in src/db/index.ts
  // is recreated against the freshly-set LINT_SERVER_DB_PATH.
  vi.resetModules();
  const { buildServer } = await import("../src/server.js");
  server = await buildServer();
});

afterEach(async () => {
  await server.close();
  try {
    unlinkSync(dbPath);
  } catch {
    /* ignore */
  }
});

describe("native auth API", () => {
  it("signs up, returns token + user, blocks duplicates", async () => {
    const signup = await server.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "alice@example.com", password: "password123" },
    });
    expect(signup.statusCode).toBe(200);
    const body = signup.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.username).toBe("alice");
    expect(body.token).toBeTruthy();
    expect(body.expires_at).toBeTruthy();

    const dup = await server.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "alice@example.com", password: "password123" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await server.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "bob@example.com", password: "password123" },
    });

    const ok = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "bob@example.com", password: "password123" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTruthy();

    const ko = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "bob@example.com", password: "wrongpassword" },
    });
    expect(ko.statusCode).toBe(401);
  });

  it("returns 401 on /me without token, 200 with valid token", async () => {
    const signup = await server.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "carol@example.com", password: "password123" },
    });
    const token = signup.json().token;

    const noAuth = await server.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });
    expect(noAuth.statusCode).toBe(401);

    const withAuth = await server.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(withAuth.statusCode).toBe(200);
    expect(withAuth.json().user.email).toBe("carol@example.com");
  });

  it("invalidates the token after logout", async () => {
    const signup = await server.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "dave@example.com", password: "password123" },
    });
    const token = signup.json().token;

    const logout = await server.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(204);

    const meAfter = await server.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meAfter.statusCode).toBe(401);
  });
});

describe("Rails-compat auth API", () => {
  it("signs up via /users.json and logs in via /users/sign_in.json", async () => {
    const signup = await server.inject({
      method: "POST",
      url: "/users.json",
      payload: {
        user: { username: "eve", email: "eve@example.com", password: "password123" },
      },
    });
    expect(signup.statusCode).toBe(200);
    const body = signup.json();
    expect(body.username).toBe("eve");
    expect(body.email).toBe("eve@example.com");
    expect(body.authentication_token).toBeTruthy();

    const loginByUsername = await server.inject({
      method: "POST",
      url: "/users/sign_in.json",
      payload: { user: { login: "eve", password: "password123" } },
    });
    expect(loginByUsername.statusCode).toBe(200);
    expect(loginByUsername.json().authentication_token).toBeTruthy();

    const loginByEmail = await server.inject({
      method: "POST",
      url: "/users/sign_in.json",
      payload: { user: { login: "eve@example.com", password: "password123" } },
    });
    expect(loginByEmail.statusCode).toBe(200);
  });

  it("accepts ?user_token= query auth", async () => {
    const signup = await server.inject({
      method: "POST",
      url: "/users.json",
      payload: {
        user: { username: "frank", email: "frank@example.com", password: "password123" },
      },
    });
    const token = signup.json().authentication_token;

    const userInfo = await server.inject({
      method: "GET",
      url: `/frank.json?user_token=${token}`,
    });
    expect(userInfo.statusCode).toBe(200);
    expect(userInfo.json().username).toBe("frank");
  });
});
