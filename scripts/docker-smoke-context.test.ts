import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createContext } from "./docker-smoke-context.ts";

it("snapshots current source changes without including unrelated local files", () => {
  const root = mkdtempSync(join(tmpdir(), "smoke-source-"));
  const context = mkdtempSync(join(tmpdir(), "smoke-context-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    mkdirSync(join(root, "apps/web/src"), { recursive: true });
    writeFileSync(join(root, ".dockerignore"), "**/dist\n");
    writeFileSync(join(root, "Dockerfile"), "FROM scratch\n");
    writeFileSync(join(root, "apps/web/src/app.ts"), "old");
    execFileSync("git", ["add", "."], { cwd: root });
    writeFileSync(join(root, "apps/web/src/app.ts"), "dirty");
    writeFileSync(join(root, "apps/web/src/new.ts"), "new");
    writeFileSync(join(root, "apps/web/src/.env.production"), "secret");
    writeFileSync(join(root, "apps/web/src/.env.ts"), "secret");
    writeFileSync(join(root, "apps/web/src/credentials.json"), "secret");
    writeFileSync(join(root, "private-key.pem"), "secret");

    createContext(root, context);

    expect(readFileSync(join(context, "apps/web/src/app.ts"), "utf8")).toBe("dirty");
    expect(readFileSync(join(context, "apps/web/src/new.ts"), "utf8")).toBe("new");
    expect(readFileSync(join(context, ".dockerignore"), "utf8")).toBe("**/dist\n");
    expect(() => readFileSync(join(context, "apps/web/src/.env.production"))).toThrow();
    expect(() => readFileSync(join(context, "apps/web/src/.env.ts"))).toThrow();
    expect(() => readFileSync(join(context, "apps/web/src/credentials.json"))).toThrow();
    expect(() => readFileSync(join(context, "private-key.pem"))).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(context, { recursive: true, force: true });
  }
});
