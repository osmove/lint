import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getDatabase, schema } from "./db/index.js";
import type { User } from "./db/schema.js";

const scrypt = promisify(scryptCb);

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: string }> {
  const db = getDatabase();
  const token = newSessionToken();
  const expiresAt = sessionExpiry();
  await db.insert(schema.sessions).values({ userId, token, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  const db = getDatabase();
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}

export async function userFromToken(token: string): Promise<User | null> {
  const db = getDatabase();
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.token, token),
  });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await deleteSession(token);
    return null;
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.userId),
  });
  return user ?? null;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: User;
  }
}

function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  const headerToken = request.headers["x-lint-token"];
  if (typeof headerToken === "string") return headerToken;
  // Rails-compat: legacy `?user_token=...` query parameter used by older lint
  // CLI versions and the lint-cloud Rails backend.
  const queryToken = (request.query as Record<string, unknown> | undefined)?.user_token;
  if (typeof queryToken === "string") return queryToken;
  return null;
}

export function registerAuthHooks(server: FastifyInstance): void {
  // Optional resolution: populates request.currentUser if a valid token is sent.
  server.addHook("onRequest", async (request) => {
    const token = extractToken(request);
    if (!token) return;
    const user = await userFromToken(token);
    if (user) {
      request.currentUser = user;
    }
  });
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<User | null> {
  if (!request.currentUser) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return request.currentUser;
}
