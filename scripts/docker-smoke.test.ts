import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("fails clearly rather than skipping when Docker is unavailable", () => {
  const directory = mkdtempSync(join(tmpdir(), "smoke-no-docker-"));
  try {
    writeFileSync(join(directory, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("docker-smoke.ts", import.meta.url))],
      {
        env: { ...process.env, PATH: directory },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Docker is unavailable");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
