import { buildApp } from "./app.js";

// CALENDAR_FIXED_NOW pins the server's clock (epoch ms) for deterministic e2e/visual runs.
const fixedNow = process.env.CALENDAR_FIXED_NOW;
const now = fixedNow === undefined ? undefined : () => Number(fixedNow);
if (now !== undefined && !Number.isFinite(now()))
  throw new Error("CALENDAR_FIXED_NOW must be epoch milliseconds");

const app = buildApp({ databasePath: process.env.DATABASE_PATH ?? "calendar.sqlite", now });
try {
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
  });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
