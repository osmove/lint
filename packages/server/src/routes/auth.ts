import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSession, deleteSession, hashPassword, requireAuth, verifyPassword } from "../auth.js";
import { getDatabase, schema } from "../db/index.js";

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
});

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.post("/api/v1/auth/signup", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_credentials", details: parsed.error.issues });
      return;
    }
    const { email, password } = parsed.data;
    const db = getDatabase();
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) {
      reply.code(409).send({ error: "email_taken" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const inserted = await db.insert(schema.users).values({ email, passwordHash }).returning();
    const user = inserted[0];
    if (!user) {
      reply.code(500).send({ error: "user_creation_failed" });
      return;
    }
    const session = await createSession(user.id);
    return {
      user: { id: user.id, email: user.email },
      token: session.token,
      expires_at: session.expiresAt,
    };
  });

  server.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_credentials" });
      return;
    }
    const { email, password } = parsed.data;
    const db = getDatabase();
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user) {
      reply.code(401).send({ error: "invalid_credentials" });
      return;
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      reply.code(401).send({ error: "invalid_credentials" });
      return;
    }
    const session = await createSession(user.id);
    return {
      user: { id: user.id, email: user.email },
      token: session.token,
      expires_at: session.expiresAt,
    };
  });

  server.post("/api/v1/auth/logout", async (request, reply) => {
    const auth = request.headers.authorization;
    const headerToken = request.headers["x-lint-token"];
    const token = auth?.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : typeof headerToken === "string"
        ? headerToken
        : null;
    if (token) await deleteSession(token);
    reply.code(204).send();
  });

  server.get("/api/v1/auth/me", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return { user: { id: user.id, email: user.email } };
  });
}
