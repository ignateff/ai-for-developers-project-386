import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const checkouts: string[] = [];
function makeCheckout() {
  const checkout = mkdtempSync(join(tmpdir(), "calendar-dev-test-"));
  checkouts.push(checkout);
  cpSync(root, checkout, {
    recursive: true,
    filter: (path) => !/(^|\/)(node_modules|\.git|calendar\.sqlite)(\/|$)/.test(path),
  });
  for (const dir of ["", "apps/api", "apps/web"]) {
    symlinkSync(join(root, dir, "node_modules"), join(checkout, dir, "node_modules"), "dir");
  }
  return checkout;
}
const checkout = makeCheckout();
const env = { ...process.env, MISE_TRUSTED_CONFIG_PATHS: checkout };

afterAll(() => {
  for (const dir of checkouts) {
    try {
      execFileSync("mise", ["daemons", "stop"], {
        cwd: dir,
        env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: dir },
        stdio: "pipe",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("starts a web server when the default web port is occupied", async () => {
  const blocker = createServer();
  const ownsBlocker = await new Promise<boolean>((resolve, reject) => {
    blocker.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    blocker.listen(5173, "127.0.0.1", () => resolve(true));
  });
  try {
    const output = execFileSync("mise", ["run", "dev"], {
      cwd: checkout,
      env,
      encoding: "utf8",
      timeout: 60000,
      stdio: "pipe",
    });
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    expect(url).toBeDefined();
    expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ status: "ok" });
    const again = execFileSync("mise", ["run", "dev"], {
      cwd: checkout,
      env,
      encoding: "utf8",
      timeout: 60000,
      stdio: "pipe",
    });
    expect(again).toContain(url);
  } finally {
    if (ownsBlocker) blocker.close();
  }
}, 80000);

test("cleans up the newly started API when the web server fails", () => {
  const failing = makeCheckout();
  const config = join(failing, "mise.toml");
  writeFileSync(
    config,
    readFileSync(config, "utf8").replace(/run = '''target=.*?strictPort'''/, 'run = "exit 1"'),
  );
  const failingEnv = { ...process.env, MISE_TRUSTED_CONFIG_PATHS: failing };
  expect(() =>
    execFileSync("mise", ["run", "dev"], {
      cwd: failing,
      env: failingEnv,
      encoding: "utf8",
      timeout: 60000,
      stdio: "pipe",
    }),
  ).toThrow();
  const daemons = JSON.parse(
    execFileSync("mise", ["daemons", "ls", "--json"], {
      cwd: failing,
      env: failingEnv,
      encoding: "utf8",
    }),
  );
  expect(daemons.filter((daemon: { status: string }) => daemon.status === "running")).toEqual([]);
}, 80000);

test("uses an explicitly requested web port", async () => {
  const explicit = makeCheckout();
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const output = execFileSync("mise", ["run", "dev"], {
    cwd: explicit,
    env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: explicit, WEB_PORT: String(address.port) },
    encoding: "utf8",
    timeout: 60000,
    stdio: "pipe",
  });
  expect(output).toContain(`http://127.0.0.1:${address.port}/`);
}, 80000);

test("uses an explicitly requested API port", async () => {
  const explicit = makeCheckout();
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const output = execFileSync("mise", ["run", "dev"], {
    cwd: explicit,
    env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: explicit, PORT: String(address.port) },
    encoding: "utf8",
    timeout: 60000,
    stdio: "pipe",
  });
  const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  expect(await (await fetch(`http://127.0.0.1:${address.port}/api/health`)).json()).toEqual({
    status: "ok",
  });
  expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ status: "ok" });
}, 80000);

test("rejects an occupied explicitly requested web port", async () => {
  const explicit = makeCheckout();
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No port");
  try {
    expect(() =>
      execFileSync("mise", ["run", "dev"], {
        cwd: explicit,
        env: {
          ...process.env,
          MISE_TRUSTED_CONFIG_PATHS: explicit,
          WEB_PORT: String(address.port),
        },
        encoding: "utf8",
        timeout: 60000,
        stdio: "pipe",
      }),
    ).toThrow();
  } finally {
    reservation.close();
  }
}, 80000);

test("uses an explicitly requested API proxy target", async () => {
  const explicit = makeCheckout();
  const target = createServer((socket) => {
    socket.end("HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\ncustom");
  });
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  const address = target.address();
  if (!address || typeof address === "string") throw new Error("No port");
  try {
    const output = execFileSync("mise", ["run", "dev"], {
      cwd: explicit,
      env: {
        ...process.env,
        MISE_TRUSTED_CONFIG_PATHS: explicit,
        API_PROXY_TARGET: `http://127.0.0.1:${address.port}`,
      },
      encoding: "utf8",
      timeout: 60000,
      stdio: "pipe",
    });
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    expect(await (await fetch(`${url}/api/test`)).text()).toBe("custom");
  } finally {
    target.close();
  }
}, 80000);

test("concurrent checkouts route to separate databases and stop independently", async () => {
  const other = makeCheckout();
  const output = execFileSync("mise", ["run", "dev"], {
    cwd: other,
    env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: other },
    encoding: "utf8",
    timeout: 60000,
    stdio: "pipe",
  });
  const otherUrl = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  const firstOutput = execFileSync("mise", ["run", "dev"], {
    cwd: checkout,
    env,
    encoding: "utf8",
    timeout: 60000,
    stdio: "pipe",
  });
  const firstUrl = firstOutput.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  expect(firstUrl).toBeDefined();
  expect(otherUrl).toBeDefined();
  expect(firstUrl).not.toBe(otherUrl);
  const created = await fetch(`${firstUrl}/api/meeting-types`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Only first", description: "Test", durationMinutes: 30 }),
  });
  expect(created.status).toBe(201);
  const first = await (await fetch(`${firstUrl}/api/meeting-types`)).json();
  const second = await (await fetch(`${otherUrl}/api/meeting-types`)).json();
  expect(JSON.stringify(first)).toContain("Only first");
  expect(JSON.stringify(second)).not.toContain("Only first");
  execFileSync("mise", ["daemons", "stop"], { cwd: checkout, env, stdio: "pipe" });
  expect((await fetch(`${otherUrl}/api/health`)).status).toBe(200);
}, 80000);
