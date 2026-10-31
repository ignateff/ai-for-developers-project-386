import Fastify, { type onRouteHookHandler } from "fastify";
import { randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { openDatabase } from "./database.js";
import { bookings, meetingTypes } from "./schema.js";
import { calculateSlots, DAY, parseDate, windowStart } from "./availability.js";

export function buildApp(
  options: { onRoute?: onRouteHookHandler; databasePath?: string; now?: () => number } = {},
) {
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
    if (!name || [...name].length > 100) fields.name = "Введите название до 100 символов";
    if (!description || [...description].length > 1000)
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
  function getSnapshot(id: string, start: number) {
    return storage.db.transaction((tx) => {
      const type = tx
        .select()
        .from(meetingTypes)
        .where(and(eq(meetingTypes.id, id), eq(meetingTypes.deleted, false)))
        .get();
      if (!type) return null;
      const intervals = tx
        .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
        .from(bookings)
        .where(and(lt(bookings.startsAt, start + 14 * DAY), gt(bookings.endsAt, start)))
        .all();
      return { type, intervals };
    });
  }
  app.get<{ Params: { id: string } }>(
    "/api/meeting-types/:id/availability",
    async (request, reply) => {
      const now = (options.now ?? Date.now)();
      const start = windowStart(now);
      const snapshot = getSnapshot(request.params.id, start);
      if (!snapshot)
        return reply.status(404).send({ code: "NOT_FOUND", message: "Тип встречи не найден" });
      const days = Array.from({ length: 14 }, (_, i) => {
        const day = start + i * DAY;
        return {
          date: new Date(day).toISOString().slice(0, 10),
          availableCount: calculateSlots(
            day,
            snapshot.type.durationMinutes,
            now,
            snapshot.intervals,
          ).filter((slot) => slot.available).length,
        };
      });
      return { version: snapshot.type.version, days };
    },
  );
  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    "/api/meeting-types/:id/slots",
    async (request, reply) => {
      const now = (options.now ?? Date.now)();
      const start = windowStart(now);
      const day = parseDate(request.query.date);
      if (day === null)
        return reply
          .status(400)
          .send({ code: "INVALID_DATE", message: "Введите корректную дату UTC" });
      if (day < start || day >= start + 14 * DAY)
        return reply
          .status(400)
          .send({ code: "DATE_OUT_OF_RANGE", message: "Выберите дату в ближайшие 14 дней UTC" });
      const snapshot = getSnapshot(request.params.id, start);
      if (!snapshot)
        return reply.status(404).send({ code: "NOT_FOUND", message: "Тип встречи не найден" });
      return {
        version: snapshot.type.version,
        slots: calculateSlots(day, snapshot.type.durationMinutes, now, snapshot.intervals),
      };
    },
  );
  return app;
}
