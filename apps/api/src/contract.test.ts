import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAPIBackend from "openapi-backend";
import { parse } from "yaml";
import { expect, test } from "vitest";
import { buildApp } from "./app.js";
import { compareRoutes, collectRoutes } from "./contract-check.js";

const definition = parse(readFileSync(resolve("generated/openapi/openapi.yaml"), "utf8"));

test("the public Fastify routes match the OpenAPI operations", async () => {
  const routes = collectRoutes();
  const app = buildApp({ onRoute: routes.onRoute });
  try {
    await app.ready();
    expect(compareRoutes(routes.entries, definition)).toEqual({
      undocumented: [],
      unimplemented: [],
    });
  } finally {
    await app.close();
  }
});

test("detects real undocumented routes and a documented route without implementation", async () => {
  const routes = collectRoutes();
  const app = buildApp({ onRoute: routes.onRoute });
  app.get("/api/bookings/:id", async () => ({}));
  app.head("/api/extra", async () => {});
  app.get("/frontend", async () => "not part of API");
  try {
    await app.ready();
    const spec = {
      paths: {
        "/api/health": { get: {} },
        "/api/meeting-types": { get: {}, post: {} },
        "/api/bookings/{id}": { get: {} },
        "/api/missing": { delete: {} },
        "/frontend": { get: {} },
        "/apiary": { get: {} },
      },
    };
    expect(compareRoutes(routes.entries, spec)).toEqual({
      undocumented: ["HEAD /api/extra"],
      unimplemented: ["DELETE /api/missing"],
    });
  } finally {
    await app.close();
  }
});

test("rejects a response that violates the OpenAPI schema", async () => {
  const api = new OpenAPIBackend({ definition, strict: true });
  await api.init();
  expect(api.validateResponse({ status: "broken" }, "health", 200).errors).not.toBeNull();
});

test("health HTTP response conforms to the OpenAPI response schema", async () => {
  const api = new OpenAPIBackend({ definition, strict: true });
  await api.init();
  const app = buildApp();
  try {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const response = await fetch(`${address}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const validation = api.validateResponse(await response.json(), "health", response.status);
    expect(validation.errors).toBeNull();
  } finally {
    await app.close();
  }
});

test("meeting type success and validation responses conform to OpenAPI", async () => {
  const api = new OpenAPIBackend({ definition, strict: true });
  await api.init();
  const app = buildApp();
  try {
    for (const [method, payload, status, operation] of [
      ["GET", undefined, 200, "MeetingTypes_list"],
      [
        "POST",
        { name: "Call", description: "Intro", durationMinutes: 30 },
        201,
        "MeetingTypes_create",
      ],
      ["POST", { name: "", description: "Intro", durationMinutes: 30 }, 400, "MeetingTypes_create"],
    ] as const) {
      const response = await app.inject({ method, url: "/api/meeting-types", payload });
      expect(response.statusCode).toBe(status);
      expect(api.validateResponse(response.json(), operation, status).errors).toBeNull();
      if (status === 201) expect(response.headers.etag).toBeDefined();
    }
  } finally {
    await app.close();
  }
});

test("database failures produce safe documented errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "calendar-contract-"));
  const path = join(directory, "test.sqlite");
  const api = new OpenAPIBackend({ definition, strict: true });
  await api.init();
  const app = buildApp({ databasePath: path });
  const db = new Database(path);
  try {
    db.exec("BEGIN EXCLUSIVE");
    const busyList = await app.inject({ method: "GET", url: "/api/meeting-types" });
    expect(busyList.statusCode).toBe(503);
    expect(api.validateResponse(busyList.json(), "MeetingTypes_list", 503).errors).toBeNull();
    const busy = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: { name: "Call", description: "Intro", durationMinutes: 30 },
    });
    expect(busy.statusCode).toBe(503);
    expect(api.validateResponse(busy.json(), "MeetingTypes_create", 503).errors).toBeNull();
    db.exec("ROLLBACK");
    db.exec("DROP TABLE meeting_types");
    for (const [method, operation] of [
      ["GET", "MeetingTypes_list"],
      ["POST", "MeetingTypes_create"],
    ] as const) {
      const response = await app.inject({
        method,
        url: "/api/meeting-types",
        payload:
          method === "POST"
            ? { name: "Call", description: "Intro", durationMinutes: 30 }
            : undefined,
      });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("meeting_types");
      expect(api.validateResponse(response.json(), operation, 500).errors).toBeNull();
    }
  } finally {
    db.close();
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
