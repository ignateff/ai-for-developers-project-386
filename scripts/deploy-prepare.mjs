import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Do not inherit Git's repository/config overrides from a caller's shell.
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_NO_REPLACE_OBJECTS: "1",
};
const run = (program, args, options = {}) => execFileSync(program, args, { env, ...options });
const git = (...args) => {
  try {
    return run("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`git ${args[0]} failed (exit ${error.status ?? "unknown"})`);
  }
};
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const imageId = /^sha256:[a-f0-9]{64}$/;

function state() {
  if (git("branch", "--show-current") !== "main")
    throw new Error("checkout must already be on main");
  if (git("status", "--porcelain=v1", "--untracked-files=all"))
    throw new Error("checkout is dirty or has untracked files");
}

function revision() {
  const refs = git("rev-parse", "HEAD", "refs/heads/main", "refs/remotes/origin/main").split("\n");
  if (refs.length !== 3 || !refs.every((ref) => sha.test(ref) && ref === refs[0])) {
    throw new Error("HEAD, local main and origin/main must be identical full revisions");
  }
  return refs[0];
}

// Only files needed by the production build. Hidden paths and arbitrary file types
// are excluded even when accidentally committed beneath an allowed directory.
function allowed(path) {
  if (
    path
      .split("/")
      .some(
        (part) =>
          part.startsWith(".") ||
          /(?:secret|credential|token|password|private|\.sqlite|\.db(?:\.|$))/i.test(part),
      )
  )
    return path === ".dockerignore";
  if (
    ["Dockerfile", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "version.txt"].includes(
      path,
    )
  )
    return true;
  if (
    /^apps\/(api|web)\/(?:package\.json|tsconfig(?:\.[a-z]+)?\.json|(?:vite\.config|build-info)\.ts|index\.html)$/.test(
      path,
    )
  )
    return true;
  if (
    /^apps\/(api\/src|api\/drizzle|web\/src|web\/public)\/[a-zA-Z0-9_./-]+\.(?:ts|tsx|css|json|sql|svg|png|jpg|jpeg|webp|woff2?)$/.test(
      path,
    )
  )
    return true;
  return /^generated\/(?:sdk\/[a-zA-Z0-9_./-]+\.ts|openapi\/[a-zA-Z0-9_./-]+\.ya?ml)$/.test(path);
}

function makeWritable(path) {
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) makeWritable(join(path, entry.name));
  }
}

function freeze(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) freeze(join(path, entry.name));
  }
  chmodSync(path, 0o500);
}

let context;
try {
  if (process.argv.length !== 2) throw new Error("this preparation command accepts no arguments");
  state();
  if (realpathSync(git("rev-parse", "--show-toplevel")) !== realpathSync(process.cwd()))
    throw new Error("run from the checkout root");
  git("worktree", "list", "--porcelain");
  git(
    "fetch",
    "--no-tags",
    "--no-prune",
    "--no-recurse-submodules",
    "--no-write-fetch-head",
    "--refmap=",
    "origin",
    "refs/heads/main:refs/remotes/origin/main",
  );
  git("merge", "--ff-only", "--no-overwrite-ignore", "origin/main");
  state();
  const sourceRevision = revision();

  context = mkdtempSync(join(tmpdir(), "calendar-deploy-context-"));
  const tree = git("ls-tree", "-rz", "--full-tree", sourceRevision);
  const manifest = [];
  for (const entry of tree.split("\0")) {
    if (!entry) continue;
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match) throw new Error("invalid Git tree entry");
    const [, mode, type, object, path] = match;
    if (!allowed(path)) continue;
    if (
      type !== "blob" ||
      !["100644", "100755"].includes(mode) ||
      !sha.test(object) ||
      path.split("/").some((part) => part === ".." || part === ".")
    )
      throw new Error(`unsafe Git tree entry: ${path}`);
    const target = join(context, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(
      target,
      run("git", ["cat-file", "blob", object], { maxBuffer: 64 * 1024 * 1024 }),
      { mode: 0o400 },
    );
    manifest.push(`${mode} ${object} ${path}`);
  }
  for (const required of [
    "Dockerfile",
    ".dockerignore",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "version.txt",
    "apps/api/package.json",
    "apps/web/package.json",
  ]) {
    if (!manifest.some((entry) => entry.endsWith(` ${required}`)))
      throw new Error(`missing build input: ${required}`);
  }
  const contextDigest = createHash("sha256")
    .update(manifest.join("\n") + "\n")
    .digest("hex");
  freeze(context);
  state();
  if (revision() !== sourceRevision) throw new Error("source revision changed during preparation");
  const recordDir = mkdtempSync(join(tmpdir(), "calendar-deploy-provenance-"));
  const iidfile = join(recordDir, "image-id");
  run(
    "docker",
    [
      "build",
      "--platform",
      "linux/amd64",
      "--build-arg",
      `APP_REVISION=${sourceRevision}`,
      "--label",
      `org.opencontainers.image.revision=${sourceRevision}`,
      "--iidfile",
      iidfile,
      context,
    ],
    { stdio: "inherit" },
  );
  const localImageId = readFileSync(iidfile, "utf8").trim();
  if (!imageId.test(localImageId)) throw new Error("Docker did not provide a valid local image ID");
  const inspected = JSON.parse(
    run("docker", ["image", "inspect", localImageId], { encoding: "utf8" }),
  );
  const image = Array.isArray(inspected) && inspected.length === 1 ? inspected[0] : null;
  if (
    !image ||
    image.Id !== localImageId ||
    image.Os !== "linux" ||
    image.Architecture !== "amd64" ||
    image.Config?.Labels?.["org.opencontainers.image.revision"] !== sourceRevision
  )
    throw new Error("local image inspection does not match revision and platform");
  state();
  if (revision() !== sourceRevision) throw new Error("source revision changed during build");
  const record = {
    schemaVersion: 1,
    sourceRevision,
    platform: "linux/amd64",
    localImageId,
    contextManifestSha256: contextDigest,
    contextManifest: manifest,
    registryDigest: null,
  };
  const recordPath = join(recordDir, "provenance.json");
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(
    `Prepared local image ${localImageId}; provenance: ${recordPath}\nNot published or deployed.`,
  );
} catch (error) {
  console.error(`Preparation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (context) {
    makeWritable(context);
    rmSync(context, { recursive: true, force: true });
  }
}
