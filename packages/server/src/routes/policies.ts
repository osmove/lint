import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { getDatabase, schema } from "../db/index.js";

const policyInputSchema = z.object({
  name: z.string().min(1).max(120),
  yaml: z.string().min(1),
});

export async function registerPolicyRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/policies", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const db = getDatabase();
    const rows = await db.query.policies.findMany({
      where: eq(schema.policies.userId, user.id),
    });
    return { policies: rows };
  });

  server.post("/api/v1/policies", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const parsed = policyInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.issues });
      return;
    }
    const db = getDatabase();
    const inserted = await db
      .insert(schema.policies)
      .values({ userId: user.id, name: parsed.data.name, yaml: parsed.data.yaml })
      .returning();
    return { policy: inserted[0] };
  });

  server.get<{ Params: { id: string } }>("/api/v1/policies/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const id = Number(request.params.id);
    if (!Number.isFinite(id)) {
      reply.code(400).send({ error: "invalid_id" });
      return;
    }
    const db = getDatabase();
    const row = await db.query.policies.findFirst({
      where: and(eq(schema.policies.id, id), eq(schema.policies.userId, user.id)),
    });
    if (!row) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    return { policy: row };
  });

  server.patch<{ Params: { id: string } }>("/api/v1/policies/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const id = Number(request.params.id);
    if (!Number.isFinite(id)) {
      reply.code(400).send({ error: "invalid_id" });
      return;
    }
    const parsed = policyInputSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.issues });
      return;
    }
    const db = getDatabase();
    const existing = await db.query.policies.findFirst({
      where: and(eq(schema.policies.id, id), eq(schema.policies.userId, user.id)),
    });
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const updates: Record<string, string> = { updatedAt: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.yaml !== undefined) updates.yaml = parsed.data.yaml;
    const updated = await db
      .update(schema.policies)
      .set(updates)
      .where(eq(schema.policies.id, id))
      .returning();
    return { policy: updated[0] };
  });

  server.delete<{ Params: { id: string } }>("/api/v1/policies/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const id = Number(request.params.id);
    if (!Number.isFinite(id)) {
      reply.code(400).send({ error: "invalid_id" });
      return;
    }
    const db = getDatabase();
    const existing = await db.query.policies.findFirst({
      where: and(eq(schema.policies.id, id), eq(schema.policies.userId, user.id)),
    });
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    await db.delete(schema.policies).where(eq(schema.policies.id, id));
    reply.code(204).send();
  });
}
