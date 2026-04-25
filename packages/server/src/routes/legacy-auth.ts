import { eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSession, hashPassword, verifyPassword } from "../auth.js";
import { getDatabase, schema } from "../db/index.js";

// These endpoints exist for Rails-compatibility with the existing `lint`
// npm package (versions 0.x through 1.2.x) which targets the lint-cloud
// Rails backend at `https://api.lint.to`. They mirror the request and
// response shapes Devise produces, so the CLI works against either
// backend without modification.

const railsLoginSchema = z.object({
  user: z.object({
    login: z.string().min(1),
    password: z.string().min(1),
  }),
});

const railsSignupSchema = z.object({
  user: z.object({
    username: z.string().min(1).max(64),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export async function registerLegacyAuthRoutes(server: FastifyInstance): Promise<void> {
  // POST /users/sign_in.json — Rails Devise-style login
  server.post("/users/sign_in.json", async (request, reply) => {
    const parsed = railsLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_credentials" });
      return;
    }
    const login = parsed.data.user.login.toLowerCase();
    const db = getDatabase();
    const user = await db.query.users.findFirst({
      where: or(eq(schema.users.username, login), eq(schema.users.email, login)),
    });
    if (!user) {
      reply.code(401).send({ error: "Invalid login or password." });
      return;
    }
    const ok = await verifyPassword(parsed.data.user.password, user.passwordHash);
    if (!ok) {
      reply.code(401).send({ error: "Invalid login or password." });
      return;
    }
    const session = await createSession(user.id);
    return {
      username: user.username,
      authentication_token: session.token,
      email: user.email,
    };
  });

  // POST /users.json — Rails Devise-style signup
  server.post("/users.json", async (request, reply) => {
    const parsed = railsSignupSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.issues });
      return;
    }
    const { username, email, password } = parsed.data.user;
    const usernameLower = username.toLowerCase();
    const emailLower = email.toLowerCase();
    const db = getDatabase();
    const existing = await db.query.users.findFirst({
      where: or(
        eq(schema.users.username, usernameLower),
        eq(schema.users.email, emailLower),
      ),
    });
    if (existing) {
      reply.code(409).send({ error: "username_or_email_taken" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const inserted = await db
      .insert(schema.users)
      .values({ username: usernameLower, email: emailLower, passwordHash })
      .returning();
    const user = inserted[0];
    if (!user) {
      reply.code(500).send({ error: "user_creation_failed" });
      return;
    }
    const session = await createSession(user.id);
    return {
      username: user.username,
      authentication_token: session.token,
      email: user.email,
    };
  });

  // GET /:username.json — Rails-style user fetch (used by `lint auth status`)
  server.get<{ Params: { username: string } }>("/:username.json", async (request, reply) => {
    const username = request.params.username.toLowerCase();
    if (!request.currentUser) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const db = getDatabase();
    const user = await db.query.users.findFirst({
      where: eq(schema.users.username, username),
    });
    if (!user) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    return { username: user.username, email: user.email };
  });
}
