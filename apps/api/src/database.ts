import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

export function openDatabase(path: string) {
  const sqlite = new Database(path, { timeout: 250 });
  sqlite.exec("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  try {
    migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return { db, close: () => sqlite.close() };
}
