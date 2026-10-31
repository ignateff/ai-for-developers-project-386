import Fastify, { type onRouteHookHandler } from "fastify";
import { openDatabase } from "./database/database.js";
import { meetingTypeRoutes } from "./meeting-types/routes.js";
import { availabilityRoutes } from "./availability/routes.js";
import { bookingRoutes } from "./bookings/routes.js";
import { eventRoutes } from "./events/routes.js";

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
  app.register(meetingTypeRoutes, { storage });
  app.register(availabilityRoutes, { storage, now: options.now });
  app.register(eventRoutes, { storage, now: options.now });
  app.register(bookingRoutes, {
    storage,
    now: options.now,
    onBookingLocked: options.onBookingLocked,
  });
  return app;
}
