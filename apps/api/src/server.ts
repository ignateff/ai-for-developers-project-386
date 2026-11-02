import { buildApp } from "./app.js";

// CALENDAR_FIXED_NOW pins the server's clock (epoch ms) for deterministic e2e/visual runs.
let stage = "configuration";
try {
  const fixedNow = process.env.CALENDAR_FIXED_NOW;
  const now = fixedNow === undefined ? undefined : () => Number(fixedNow);
  if (now !== undefined && !Number.isFinite(now())) throw new Error("Invalid clock");
  stage = "database";
  const app = buildApp({ databasePath: process.env.DATABASE_PATH ?? "calendar.sqlite", now });
  stage = "listen";
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
    listenTextResolver: () => "Server listening",
  });
  app.log.info({ event: "startup_complete" }, "API started");
} catch {
  console.error(
    JSON.stringify({ level: 50, event: "startup_failed", stage, msg: "API startup failed" }),
  );
  process.exitCode = 1;
}
