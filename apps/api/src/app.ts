import Fastify, { type onRouteHookHandler } from "fastify";

export function buildApp(options: { onRoute?: onRouteHookHandler } = {}) {
  const app = Fastify({ logger: false, exposeHeadRoutes: false });
  if (options.onRoute) app.addHook("onRoute", options.onRoute);
  app.get("/api/health", async () => ({ status: "ok" }));
  return app;
}
