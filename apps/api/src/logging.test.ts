import { Writable } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { buildApp } from "./app.js";

it("logs unexpected booking errors with safe request context only", async () => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const app = buildApp({
    logStream: stream,
    now: () => Date.parse("2026-10-30T08:00:00Z"),
    onBookingLocked: () => {
      throw new Error("secret-error alice@example.com", { cause: new Error("secret-cause") });
    },
  });
  try {
    const type = (
      await app.inject({
        method: "POST",
        url: "/api/meeting-types",
        payload: { name: "Call", description: "Intro", durationMinutes: 30 },
      })
    ).json();
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings?private=secret-query",
      headers: {
        "idempotency-key": "secret-attempt",
        authorization: "secret-token",
        "x-request-id": "secret-request-id",
      },
      payload: {
        meetingTypeId: type.id,
        meetingTypeVersion: 1,
        startsAt: "2026-10-30T09:00:00.000Z",
        guestName: "secret-name",
        guestEmail: "alice@example.com",
      },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "INTERNAL_ERROR",
      message: "Не удалось выполнить запрос",
    });
    await app.inject({ method: "GET", url: "/api/secret-url-path?secret-url-query=1" });
    const records = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records).toContainEqual(
      expect.objectContaining({
        level: 50,
        method: "POST",
        route: "/api/bookings",
        statusCode: 500,
        reqId: expect.any(String),
      }),
    );
    for (const secret of [
      "secret-query",
      "secret-attempt",
      "secret-token",
      "secret-request-id",
      "secret-name",
      "alice@example.com",
      "secret-error",
      "secret-cause",
      "secret-url-path",
      "secret-url-query",
    ])
      expect(output).not.toContain(secret);
  } finally {
    await app.close();
  }
});

it("reports database startup failures without leaking the database path", async () => {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./server.ts", import.meta.url))],
    {
      env: { ...process.env, DATABASE_PATH: "/missing-secret-directory/calendar.sqlite" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.stderr.on("data", (data) => {
    output += data.toString();
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  expect(code).toBe(1);
  expect(output).not.toContain("missing-secret-directory");
  expect(
    output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toContainEqual(
    expect.objectContaining({ level: 50, event: "startup_failed", stage: "database" }),
  );
});
