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
