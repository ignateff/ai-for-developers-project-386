import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { createContext } from "./docker-smoke-context.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const id = randomBytes(12).toString("hex");
const image = `calendar-smoke:${id}`;
const container = `calendar-smoke-${id}`;
// This is a test marker, not a claim that the working tree equals a commit.
const revision = randomBytes(20).toString("hex");
const context = mkdtempSync(join(tmpdir(), "calendar-smoke-"));
let containerId: string | undefined;
let imageCreated = false;

function docker(args: string[], timeout = 30_000): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

async function main(): Promise<void> {
  try {
    docker(["info", "--format", "{{.ServerVersion}}"]);
  } catch (error) {
    throw new Error(
      "Docker is unavailable: install/start Docker and ensure its daemon is reachable",
      { cause: error },
    );
  }
  createContext(root, context);
  const version = readFileSync(join(context, "version.txt"), "utf8").trim();
  console.log(
    `Building working-copy snapshot for linux/amd64 (synthetic smoke marker ${revision.slice(0, 7)}; not a Git revision)`,
  );
  docker(
    [
      "build",
      "--platform",
      "linux/amd64",
      "--build-arg",
      `APP_REVISION=${revision}`,
      "-t",
      image,
      context,
    ],
    1_800_000,
  );
  imageCreated = true;
  containerId = docker([
    "create",
    "--platform",
    "linux/amd64",
    "--name",
    container,
    "-p",
    "127.0.0.1::8080",
    "-e",
    "PORT=8080",
    "-e",
    "DATABASE_PATH=:memory:",
    image,
  ]);
  docker(["start", containerId]);
  const mapping = docker(["port", containerId, "8080/tcp"]);
  const port = /127\.0\.0\.1:(\d+)$/.exec(mapping)?.[1];
  if (!port) throw new Error(`Unexpected Docker port mapping: ${mapping}`);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 200 && JSON.stringify(await response.json()) === '{"status":"ok"}') {
        healthy = true;
        break;
      }
    } catch {
      // Startup may not have completed yet.
    }
    await delay(500);
  }
  if (!healthy)
    throw new Error(
      'Container health did not return HTTP 200 and {"status":"ok"} within 60 seconds',
    );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    const messages: string[] = [];
    const assets: { url: string; status: number }[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
      if (message.type() === "info" && message.text().startsWith("Calendar v"))
        messages.push(message.text());
    });
    page.on("response", (response) => {
      if (response.request().resourceType() === "script")
        assets.push({ url: response.url(), status: response.status() });
    });
    const response = await page.goto(base, { waitUntil: "networkidle", timeout: 30_000 });
    if (response?.status() !== 200)
      throw new Error(`Root page returned ${response?.status() ?? "no response"}`);
    await page
      .getByRole("navigation", { name: "Основная навигация" })
      .waitFor({ state: "visible", timeout: 10_000 });
    const expected = `Calendar v${version} (${revision.slice(0, 7)})`;
    if (JSON.stringify(messages) !== JSON.stringify([expected]))
      throw new Error(
        `Expected exact production message ${expected}; got ${JSON.stringify(messages)}`,
      );
    if (!assets.length || assets.some((asset) => asset.status !== 200))
      throw new Error(`Frontend script assets failed: ${JSON.stringify(assets)}`);
    if (errors.length) throw new Error(`Browser JavaScript errors: ${errors.join("; ")}`);
    console.log(
      `Production smoke passed: health, root, ${assets.length} script asset(s), and ${expected}`,
    );
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const args of [
    containerId ? ["rm", "-f", containerId] : null,
    imageCreated ? ["image", "rm", image] : null,
  ]) {
    if (!args) continue;
    try {
      docker(args);
    } catch (error) {
      console.error(`Could not clean up owned Docker resource: ${args.join(" ")}`, error);
      process.exitCode = 1;
    }
  }
  rmSync(context, { recursive: true, force: true });
}
