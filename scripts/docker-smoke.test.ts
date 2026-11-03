import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

it.each(["signal", "uncertain-build", "uncertain-create", "foreign"])(
  "cleans only verified owned resources after %s",
  (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), "smoke-fake-docker-"));
    try {
      const log = join(directory, "calls");
      const state = join(directory, "state.json");
      writeFileSync(state, "{}");
      writeFileSync(
        join(directory, "docker"),
        `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));
const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));
if (args[0] === 'info') process.exit(0);
if (args[0] === 'build') {
  const label = args[args.indexOf('--label') + 1];
  state.owner = label?.split('=')[1]; state.image = args[args.indexOf('-t') + 1]; save();
  if (process.env.FAKE_SCENARIO === 'signal') { process.kill(process.ppid, 'SIGTERM'); setInterval(() => {}, 1000); return; }
  if (process.env.FAKE_SCENARIO === 'uncertain-build') process.exit(1);
  process.exit(0);
}
if (args[0] === 'create') { state.container = args[args.indexOf('--name') + 1]; save(); process.exit(1); }
if ((args[0] === 'image' && args[1] === 'inspect') || (args[0] === 'container' && args[1] === 'inspect')) {
  const exists = args[0] === 'image' ? state.image : state.container;
  if (!exists) process.exit(1);
  console.log(JSON.stringify({ Id: (args[0] === 'image' ? 'sha256:' : '') + 'b'.repeat(64), Config: { Labels: { 'calendar.smoke.owner': process.env.FAKE_SCENARIO === 'foreign' ? 'someone-else' : state.owner } } }));
  process.exit(0);
}
if (args[0] === 'rm') { delete state.container; save(); process.exit(0); }
if (args[0] === 'image' && args[1] === 'rm') { delete state.image; save(); process.exit(0); }
process.exit(1);
`,
        { mode: 0o755 },
      );
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("docker-smoke.ts", import.meta.url))],
        {
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            FAKE_LOG: log,
            FAKE_STATE: state,
            FAKE_SCENARIO: scenario,
          },
          encoding: "utf8",
          timeout: 30_000,
        },
      );
      expect(result.status).not.toBe(0);
      if (scenario === "signal" || scenario.startsWith("uncertain"))
        expect(result.stderr).toContain("outcome was uncertain");
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
      if (scenario === "foreign") {
        expect(
          calls.some((args) => args[0] === "rm" || (args[0] === "image" && args[1] === "rm")),
        ).toBe(false);
      } else {
        expect(calls.some((args) => args[0] === "image" && args[1] === "rm")).toBe(true);
        if (scenario === "uncertain-create")
          expect(calls.some((args) => args[0] === "rm")).toBe(true);
        expect(JSON.parse(readFileSync(state, "utf8"))).not.toHaveProperty("image");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
