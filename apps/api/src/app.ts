import Fastify, { type onRouteHookHandler } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { openDatabase } from "./database.js";
import { meetingTypes } from "./schema.js";

export function buildApp(options: { onRoute?: onRouteHookHandler; databasePath?: string } = {}) {
  const app = Fastify({ logger: false, exposeHeadRoutes: false });
  if (options.onRoute) app.addHook("onRoute", options.onRoute);
  const storage = openDatabase(options.databasePath ?? ":memory:");
  app.addHook("onClose", async () => storage.close());
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && "statusCode" in error && error.statusCode === 400)
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Некорректный запрос" });
    let cause: unknown = error;
    while (cause instanceof Error) {
      if (
        "code" in cause &&
        typeof cause.code === "string" &&
        (cause.code.startsWith("SQLITE_BUSY") || cause.code.startsWith("SQLITE_LOCKED"))
      )
        return reply
          .status(503)
          .send({ code: "DATABASE_BUSY", message: "Сервис временно занят, попробуйте ещё раз" });
      cause = cause.cause;
    }
    void reply.status(500).send({ code: "INTERNAL_ERROR", message: "Не удалось выполнить запрос" });
  });
  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/meeting-types", async () =>
    storage.db
      .select({
        id: meetingTypes.id,
        name: meetingTypes.name,
        description: meetingTypes.description,
        durationMinutes: meetingTypes.durationMinutes,
        version: meetingTypes.version,
      })
      .from(meetingTypes)
      .where(eq(meetingTypes.deleted, false))
      .all(),
  );
  app.post("/api/meeting-types", async (request, reply) => {
    const input = request.body as Record<string, unknown> | null;
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    const durationMinutes = input?.durationMinutes;
    const fields: Record<string, string> = {};
    if (!name || name.length > 100) fields.name = "Введите название до 100 символов";
    if (!description || description.length > 1000)
      fields.description = "Введите описание до 1000 символов";
    if (
      typeof durationMinutes !== "number" ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 2147483647
    )
      fields.durationMinutes = "Введите целое число от 1 до 2147483647";
    if (Object.keys(fields).length || typeof durationMinutes !== "number")
      return reply
        .status(400)
        .send({ code: "VALIDATION_ERROR", message: "Проверьте поля", fields });
    const result = { id: randomUUID(), name, description, durationMinutes, version: 1 };
    storage.db
      .insert(meetingTypes)
      .values({ ...result, createdAt: Date.now(), deleted: false })
      .run();
    return reply.status(201).header("ETag", '"1"').send(result);
  });
  return app;
}
