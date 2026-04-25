import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let server: FastifyInstance;
let dbPath: string;
let token: string;

beforeEach(async () => {
  dbPath = join(tmpdir(), `lint-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.LINT_SERVER_DB_PATH = dbPath;
  vi.resetModules();
  const { buildServer } = await import("../src/server.js");
  server = await buildServer();
  const signup = await server.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    payload: { email: "owner@example.com", password: "password123" },
  });
  token = signup.json().token;
});

afterEach(async () => {
  await server.close();
  try {
    unlinkSync(dbPath);
  } catch {
    /* ignore */
  }
});

describe("policies CRUD", () => {
  it("requires auth on every endpoint", async () => {
    const list = await server.inject({ method: "GET", url: "/api/v1/policies" });
    expect(list.statusCode).toBe(401);

    const create = await server.inject({
      method: "POST",
      url: "/api/v1/policies",
      payload: { name: "x", yaml: "y" },
    });
    expect(create.statusCode).toBe(401);
  });

  it("creates, lists, updates, deletes scoped to the user", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/api/v1/policies",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "P1", yaml: "linters: [biome]" },
    });
    expect(create.statusCode).toBe(200);
    const policyId = create.json().policy.id;

    const list = await server.inject({
      method: "GET",
      url: "/api/v1/policies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().policies).toHaveLength(1);

    const update = await server.inject({
      method: "PATCH",
      url: `/api/v1/policies/${policyId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "P1-renamed" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().policy.name).toBe("P1-renamed");

    const del = await server.inject({
      method: "DELETE",
      url: `/api/v1/policies/${policyId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);

    const after = await server.inject({
      method: "GET",
      url: "/api/v1/policies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json().policies).toHaveLength(0);
  });

  it("isolates policies per user", async () => {
    await server.inject({
      method: "POST",
      url: "/api/v1/policies",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "owner-policy", yaml: "x: y" },
    });

    const other = await server.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email: "intruder@example.com", password: "password123" },
    });
    const otherToken = other.json().token;

    const otherList = await server.inject({
      method: "GET",
      url: "/api/v1/policies",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(otherList.json().policies).toHaveLength(0);
  });
});
