import Fastify, { type onRouteHookHandler } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { openDatabase } from "./database.js";
import { bookings, meetingTypes } from "./schema.js";
import { calculateSlots, DAY, parseDate, windowStart } from "./availability.js";

export function buildApp(
  options: {
    onRoute?: onRouteHookHandler;
    databasePath?: string;
    now?: () => number;
    onBookingLocked?: () => void;
  } = {},
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
  app.get<{ Params: { id: string } }>("/api/meeting-types/:id", async (request, reply) => {
    const type = storage.db
      .select()
      .from(meetingTypes)
      .where(and(eq(meetingTypes.id, request.params.id), eq(meetingTypes.deleted, false)))
      .get();
    if (!type)
      return reply.status(404).send({ code: "NOT_FOUND", message: "Тип встречи не найден" });
    const { id, name, description, durationMinutes, version } = type;
    return reply
      .header("ETag", `"${version}"`)
      .send({ id, name, description, durationMinutes, version });
  });
  app.put<{ Params: { id: string } }>("/api/meeting-types/:id", async (request, reply) => {
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
    const match = request.headers["if-match"];
    const result = storage.db.transaction(
      (tx) => {
        const type = tx
          .select()
          .from(meetingTypes)
          .where(and(eq(meetingTypes.id, request.params.id), eq(meetingTypes.deleted, false)))
          .get();
        if (!type) return { status: 404 as const };
        if (!match) return { status: 428 as const };
        if (match !== `"${type.version}"`) return { status: 412 as const };
        if (Object.keys(fields).length || typeof durationMinutes !== "number")
          return { status: 400 as const };
        const version =
          type.version +
          Number(
            name !== type.name ||
              description !== type.description ||
              durationMinutes !== type.durationMinutes,
          );
        tx.update(meetingTypes)
          .set({ name, description, durationMinutes, version })
          .where(eq(meetingTypes.id, type.id))
          .run();
        return {
          status: 200 as const,
          type: { id: type.id, name, description, durationMinutes, version },
        };
      },
      { behavior: "immediate" },
    );
    if (result.status === 200)
      return reply.header("ETag", `"${result.type.version}"`).send(result.type);
    const errors = {
      400: ["VALIDATION_ERROR", "Проверьте поля"],
      404: ["NOT_FOUND", "Тип встречи не найден"],
      412: ["PRECONDITION_FAILED", "Тип встречи изменился"],
      428: ["PRECONDITION_REQUIRED", "Укажите версию типа"],
    };
    const [code, message] = errors[result.status];
    return reply
      .status(result.status)
      .send({ code, message, ...(result.status === 400 ? { fields } : {}) });
  });
  app.delete<{ Params: { id: string } }>("/api/meeting-types/:id", async (request, reply) => {
    const match = request.headers["if-match"];
    const status = storage.db.transaction(
      (tx) => {
        const type = tx
          .select()
          .from(meetingTypes)
          .where(and(eq(meetingTypes.id, request.params.id), eq(meetingTypes.deleted, false)))
          .get();
        if (!type) return 404;
        if (!match) return 428;
        if (match !== `"${type.version}"`) return 412;
        tx.update(meetingTypes).set({ deleted: true }).where(eq(meetingTypes.id, type.id)).run();
        return 204;
      },
      { behavior: "immediate" },
    );
    if (status === 204) return reply.status(204).send();
    const errors = {
      404: ["NOT_FOUND", "Тип встречи не найден"],
      412: ["PRECONDITION_FAILED", "Тип встречи изменился"],
      428: ["PRECONDITION_REQUIRED", "Укажите версию типа"],
    };
    const [code, message] = errors[status];
    return reply.status(status).send({ code, message });
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
  app.get("/api/events/upcoming", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = (options.now ?? Date.now)();
    return storage.db
      .select({
        id: bookings.id,
        meetingTypeName: bookings.meetingTypeName,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        guestName: bookings.guestName,
        guestEmail: bookings.guestEmail,
      })
      .from(bookings)
      .where(gt(bookings.startsAt, now))
      .orderBy(asc(bookings.startsAt), asc(bookings.id))
      .all()
      .map((event) => ({
        ...event,
        startsAt: new Date(event.startsAt).toISOString(),
        endsAt: new Date(event.endsAt).toISOString(),
      }));
  });
  app.post("/api/bookings", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = request.body as Record<string, unknown> | null;
    const key = request.headers["idempotency-key"];
    const name = typeof input?.guestName === "string" ? input.guestName.trim() : "";
    const email = typeof input?.guestEmail === "string" ? input.guestEmail.trim() : "";
    const fields: Record<string, string> = {};
    if (!name || [...name].length > 100) fields.guestName = "Введите имя до 100 символов";
    if (!email || [...email].length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
      fields.guestEmail = "Введите корректный email до 254 символов";
    const startsAt = typeof input?.startsAt === "string" ? input.startsAt : "";
    const start = Date.parse(startsAt);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(startsAt) ||
      !Number.isFinite(start) ||
      new Date(start).toISOString().slice(0, 10) !== startsAt.slice(0, 10)
    )
      fields.startsAt = "Введите корректное время UTC";
    if (typeof input?.meetingTypeId !== "string" || !input.meetingTypeId)
      fields.meetingTypeId = "Выберите тип встречи";
    if (
      typeof input?.meetingTypeVersion !== "number" ||
      !Number.isSafeInteger(input.meetingTypeVersion) ||
      input.meetingTypeVersion < 1
    )
      fields.meetingTypeVersion = "Выберите актуальный тип встречи";
    if (typeof key !== "string" || !key.trim() || key.length > 200)
      fields.idempotencyKey = "Укажите ключ попытки";
    if (
      Object.keys(fields).length ||
      typeof key !== "string" ||
      typeof input?.meetingTypeId !== "string" ||
      typeof input.meetingTypeVersion !== "number"
    )
      return reply
        .status(400)
        .send({ code: "VALIDATION_ERROR", message: "Проверьте поля", fields });
    const keyHash = createHash("sha256").update(key).digest("hex");
    const canonicalStart = new Date(start).toISOString();
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          input.meetingTypeId,
          input.meetingTypeVersion,
          canonicalStart,
          name,
          email,
        ]),
      )
      .digest("hex");
    const typeId = input.meetingTypeId;
    const version = input.meetingTypeVersion;
    const result = storage.db.transaction(
      (tx) => {
        options.onBookingLocked?.();
        const existing = tx
          .select()
          .from(bookings)
          .where(eq(bookings.idempotencyKeyHash, keyHash))
          .get();
        if (existing) {
          if (existing.requestFingerprint !== fingerprint)
            return {
              status: 409 as const,
              body: {
                code: "IDEMPOTENCY_KEY_REUSED",
                message: "Ключ уже использован с другими данными",
              },
            };
          return { status: 201 as const, body: bookingResponse(existing) };
        }
        const type = tx.select().from(meetingTypes).where(eq(meetingTypes.id, typeId)).get();
        if (!type || type.deleted || type.version !== version)
          return {
            status: 409 as const,
            body: {
              code: "MEETING_TYPE_CHANGED",
              message: "Тип встречи изменился или недоступен. Выберите тип заново",
            },
          };
        const now = (options.now ?? Date.now)();
        const day = windowStart(start);
        const window = windowStart(now);
        const matchingSlot =
          day >= window &&
          day < window + 14 * DAY &&
          calculateSlots(day, type.durationMinutes, now, []).some(
            (slot) => slot.startsAt === canonicalStart,
          );
        const end = start + type.durationMinutes * 60_000;
        const overlap = tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(lt(bookings.startsAt, end), gt(bookings.endsAt, start)))
          .get();
        if (!matchingSlot || overlap)
          return {
            status: 409 as const,
            body: { code: "SLOT_UNAVAILABLE", message: "Слот недоступен, выберите другое время" },
          };
        const booking = {
          id: randomUUID(),
          meetingTypeId: type.id,
          meetingTypeName: type.name,
          meetingTypeDescription: type.description,
          meetingTypeDurationMinutes: type.durationMinutes,
          guestName: name,
          guestEmail: email,
          startsAt: start,
          endsAt: end,
          createdAt: now,
          idempotencyKeyHash: keyHash,
          requestFingerprint: fingerprint,
        };
        tx.insert(bookings).values(booking).run();
        return { status: 201 as const, body: bookingResponse(booking) };
      },
      { behavior: "immediate" },
    );
    return reply.status(result.status).send(result.body);
  });
  return app;
}

function bookingResponse(booking: typeof bookings.$inferSelect) {
  return {
    id: booking.id,
    meetingTypeId: booking.meetingTypeId,
    meetingTypeName: booking.meetingTypeName,
    meetingTypeDescription: booking.meetingTypeDescription,
    meetingTypeDurationMinutes: booking.meetingTypeDurationMinutes,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    startsAt: new Date(booking.startsAt).toISOString(),
    endsAt: new Date(booking.endsAt).toISOString(),
    createdAt: new Date(booking.createdAt).toISOString(),
  };
}
