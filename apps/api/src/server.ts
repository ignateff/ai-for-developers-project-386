import { buildApp } from "./app.js";

const app = buildApp({ databasePath: process.env.DATABASE_PATH ?? "calendar.sqlite" });
try {
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
  });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
