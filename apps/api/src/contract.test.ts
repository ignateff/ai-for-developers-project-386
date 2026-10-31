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
        "/api/bookings": { post: {} },
        "/api/meeting-types/{id}/availability": { get: {} },
        "/api/meeting-types/{id}/slots": { get: {} },
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
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
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
      const response = await fetch(`${address}/api/meeting-types`, {
        method,
        ...(payload
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
          : {}),
      });
      expect(response.status).toBe(status);
      expect(api.validateResponse(await response.json(), operation, status).errors).toBeNull();
      if (status === 201) expect(response.headers.get("etag")).toBeDefined();
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
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    db.exec("BEGIN EXCLUSIVE");
    const busyList = await fetch(`${address}/api/meeting-types`);
    expect(busyList.status).toBe(503);
    expect(api.validateResponse(await busyList.json(), "MeetingTypes_list", 503).errors).toBeNull();
    const busy = await fetch(`${address}/api/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Call", description: "Intro", durationMinutes: 30 }),
    });
    expect(busy.status).toBe(503);
    expect(api.validateResponse(await busy.json(), "MeetingTypes_create", 503).errors).toBeNull();
    for (const [url, operation] of [
      ["/api/meeting-types/id/availability", "Availability_summary"],
      [
        "/api/meeting-types/id/slots?date=" + new Date().toISOString().slice(0, 10),
        "Availability_slots",
      ],
    ] as const) {
      const response = await fetch(`${address}${url}`);
      expect(response.status).toBe(503);
      expect(api.validateResponse(await response.json(), operation, 503).errors).toBeNull();
    }
    db.exec("ROLLBACK");
    db.exec("DROP TABLE meeting_types");
    for (const [url, operation] of [
      ["/api/meeting-types/id/availability", "Availability_summary"],
      [
        "/api/meeting-types/id/slots?date=" + new Date().toISOString().slice(0, 10),
        "Availability_slots",
      ],
    ] as const) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("meeting_types");
      expect(api.validateResponse(response.json(), operation, 500).errors).toBeNull();
    }
    for (const [method, operation] of [
      ["GET", "MeetingTypes_list"],
      ["POST", "MeetingTypes_create"],
    ] as const) {
      const response = await fetch(`${address}/api/meeting-types`, {
        method,
        ...(method === "POST"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: "Call", description: "Intro", durationMinutes: 30 }),
            }
          : {}),
      });
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).not.toContain("meeting_types");
      expect(api.validateResponse(JSON.parse(body), operation, 500).errors).toBeNull();
    }
  } finally {
    db.close();
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("availability success and client errors conform to OpenAPI", async () => {
  const api = new OpenAPIBackend({ definition, strict: true });
  await api.init();
  const app = buildApp({ now: () => Date.parse("2026-10-30T08:00:00Z") });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: { name: "Call", description: "Intro", durationMinutes: 30 },
    });
    const id = created.json().id;
    for (const [url, status, operation] of [
      [`/api/meeting-types/${id}/availability`, 200, "Availability_summary"],
      [`/api/meeting-types/${id}/slots?date=2026-10-30`, 200, "Availability_slots"],
      [`/api/meeting-types/${id}/slots?date=2026-11-13`, 400, "Availability_slots"],
      ["/api/meeting-types/missing/availability", 404, "Availability_summary"],
      ["/api/meeting-types/missing/slots?date=2026-10-30", 404, "Availability_slots"],
    ] as const) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(status);
      expect(api.validateResponse(response.json(), operation, status).errors).toBeNull();
    }
  } finally {
    await app.close();
  }
});

test("booking responses and required no-store header match OpenAPI", async () => {
  const directory = mkdtempSync(join(tmpdir(), "booking-contract-"));
  const path = join(directory, "db.sqlite");
  const app = buildApp({ databasePath: path, now: () => Date.parse("2026-10-30T08:00:00Z") });
  const db = new Database(path);
  const api = new OpenAPIBackend({ definition, strict: true });
  await api.init();
  try {
    const type = (
      await app.inject({
        method: "POST",
        url: "/api/meeting-types",
        payload: { name: "Call", description: "Intro", durationMinutes: 30 },
      })
    ).json();
    const payload = {
      meetingTypeId: type.id,
      meetingTypeVersion: 1,
      startsAt: "2026-10-30T09:00:00.000Z",
      guestName: "Guest",
      guestEmail: "g@example.com",
    };
    const send = (data: object, key: string) =>
      app.inject({
        method: "POST",
        url: "/api/bookings",
        payload: data,
        headers: { "idempotency-key": key },
      });
    async function validate(response: Awaited<ReturnType<typeof send>>, status: number) {
      expect(response.statusCode).toBe(status);
      expect(api.validateResponse(response.json(), "createBooking", status).errors).toBeNull();
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).not.toContain("secret-key");
    }
    await validate(await send({ ...payload, guestEmail: "bad" }, "bad"), 400);
    await validate(await send(payload, "secret-key"), 201);
    await validate(await send(payload, "different-key"), 409);
    db.exec("BEGIN IMMEDIATE");
    await validate(await send({ ...payload, startsAt: "2026-10-30T10:00:00.000Z" }, "busy"), 503);
    db.exec("ROLLBACK");
    db.exec("DROP TABLE bookings");
    const failure = await send(payload, "error");
    await validate(failure, 500);
    expect(failure.body).not.toContain("bookings");
  } finally {
    db.close();
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
