import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { createContext, readApprovals } from "./docker-smoke-context.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const id = randomBytes(12).toString("hex");
const image = `calendar-smoke:${id}`;
const container = `calendar-smoke-${id}`;
// This is a test marker, not a claim that the working tree equals a commit.
const revision = randomBytes(20).toString("hex");
const context = mkdtempSync(join(tmpdir(), "calendar-smoke-"));
let containerId: string | undefined;
let buildAttempted = false;
let createAttempted = false;
let uncertain = false;
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    uncertain = true;
    controller.abort(new Error(`Interrupted by ${signal}`));
  });
}

function docker(args: string[], timeout = 30_000, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      killed = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", stop);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", stop);
      if (code === 0 && !killed) resolve(stdout.trim());
      else
        reject(
          new Error(
            `docker ${args[0]} failed${killed ? " or was interrupted (outcome may be unknown)" : ` (exit ${code})`}: ${stderr.trim()}`,
          ),
        );
    });
  });
}

async function main(): Promise<void> {
  try {
    await docker(["info", "--format", "{{.ServerVersion}}"], 30_000, controller.signal);
  } catch (error) {
    throw new Error(
      "Docker is unavailable: install/start Docker and ensure its daemon is reachable",
      { cause: error },
    );
  }
  createContext(root, context, readApprovals(root));
  const version = readFileSync(join(context, "version.txt"), "utf8").trim();
  console.log(
    `Building working-copy snapshot for linux/amd64 (synthetic smoke marker ${revision.slice(0, 7)}; not a Git revision)`,
  );
  buildAttempted = true;
  uncertain = true;
  await docker(
    [
      "build",
      "--platform",
      "linux/amd64",
      "--build-arg",
      `APP_REVISION=${revision}`,
      "--label",
      `calendar.smoke.owner=${id}`,
      "-t",
      image,
      context,
    ],
    1_800_000,
    controller.signal,
  );
  uncertain = false;
  createAttempted = true;
  uncertain = true;
  containerId = await docker(
    [
      "create",
      "--platform",
      "linux/amd64",
      "--name",
      container,
      "--label",
      `calendar.smoke.owner=${id}`,
      "-p",
      "127.0.0.1::8080",
      "-e",
      "PORT=8080",
      "-e",
      "DATABASE_PATH=:memory:",
      image,
    ],
    30_000,
    controller.signal,
  );
  uncertain = false;
  await docker(["start", containerId], 30_000, controller.signal);
  const mapping = await docker(["port", containerId, "8080/tcp"], 30_000, controller.signal);
  const port = /127\.0\.0\.1:(\d+)$/.exec(mapping)?.[1];
  if (!port) throw new Error(`Unexpected Docker port mapping: ${mapping}`);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < deadline) {
    controller.signal.throwIfAborted();
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 200 && JSON.stringify(await response.json()) === '{"status":"ok"}') {
        healthy = true;
        break;
      }
    } catch {
      // Startup may not have completed yet.
    }
    await delay(500, undefined, { signal: controller.signal });
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
    controller.signal.throwIfAborted();
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
  for (const resource of [
    createAttempted ? { kind: "container", name: container } : null,
    buildAttempted ? { kind: "image", name: image } : null,
  ]) {
    if (!resource) continue;
    try {
      const inspected = JSON.parse(
        await docker([resource.kind, "inspect", "--format", "{{json .}}", resource.name]),
      );
      if (inspected?.Config?.Labels?.["calendar.smoke.owner"] !== id)
        throw new Error("ownership label mismatch; resource left untouched");
      const resourceId: unknown = inspected.Id;
      const idPattern = resource.kind === "container" ? /^[a-f0-9]{64}$/ : /^sha256:[a-f0-9]{64}$/;
      if (typeof resourceId !== "string" || !idPattern.test(resourceId))
        throw new Error("invalid inspected resource ID; resource left untouched");
      await docker(
        resource.kind === "container" ? ["rm", "-f", resourceId] : ["image", "rm", resourceId],
      );
    } catch (error) {
      console.error(`Could not verify/clean Docker ${resource.kind} ${resource.name}:`, error);
      process.exitCode = 1;
    }
  }
  if (uncertain) {
    console.error(
      `Docker command outcome was uncertain; inspect these run-specific resources for late completion: container=${container} image=${image} label=calendar.smoke.owner=${id}`,
    );
    process.exitCode = 1;
  }
  rmSync(context, { recursive: true, force: true });
}
