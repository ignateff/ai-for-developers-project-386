import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5319", browserName: "chromium" },
  webServer: [
    {
      command: "DATABASE_PATH=:memory: PORT=3319 mise run dev-api",
      url: "http://127.0.0.1:3319/api/health",
      reuseExistingServer: false,
    },
    {
      command:
        "API_PROXY_TARGET=http://127.0.0.1:3319 mise run dev-web -- --port 5319 --strictPort",
      url: "http://127.0.0.1:5319",
      reuseExistingServer: false,
    },
  ],
});
