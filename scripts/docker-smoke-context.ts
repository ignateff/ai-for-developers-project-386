import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

// Support a conservative subset, failing closed if Docker's rules are more complex.
function ignoredByDocker(root: string): (path: string) => boolean {
  if (!lstatSync(join(root, ".dockerignore")).isFile())
    throw new Error(".dockerignore must be a regular file");
  const rules = readFileSync(join(root, ".dockerignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const patterns = rules.map((rule) => {
    if (rule.startsWith("!") || /[?\[\]\\]/.test(rule))
      throw new Error("Unsupported .dockerignore rule; smoke cannot safely determine the context");
    const normalized = rule.replace(/^\/+|\/+$/g, "");
    if (normalized === ".") return /$a/;
    if (normalized.split("/").some((part) => part === "." || part === ".." || !part))
      throw new Error("Unsupported .dockerignore rule; smoke cannot safely determine the context");
    if (!/^(?:\*\*\/)?(?:[\w.\-/]+|\*\.[\w.-]+)$/.test(normalized))
      throw new Error("Unsupported .dockerignore rule; smoke cannot safely determine the context");
    const anywhere = normalized.startsWith("**/");
    const suffix = anywhere ? normalized.slice(3) : normalized;
    const expression =
      (anywhere ? "(?:.*/)?" : "") +
      suffix.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    return new RegExp(`^${expression}$`);
  });
  return (path) => {
    const parts = path.split("/");
    return parts.some((_, index) =>
      patterns.some((pattern) => pattern.test(parts.slice(0, index + 1).join("/"))),
    );
  };
}

export function readApprovals(root: string, path = process.env.CALENDAR_SMOKE_ALLOWLIST): string[] {
  if (!path) return [];
  if (!isAbsolute(path))
    throw new Error("CALENDAR_SMOKE_ALLOWLIST must be an absolute path outside the checkout");
  const realRoot = realpathSync(root);
  const realPath = realpathSync(path);
  const fromRoot = relative(realRoot, realPath);
  if (!fromRoot || (fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot)))
    throw new Error("Smoke approval list must be outside the checkout");
  const approvals: unknown = JSON.parse(readFileSync(realPath, "utf8"));
  if (
    !Array.isArray(approvals) ||
    !approvals.every(
      (item) =>
        typeof item === "string" &&
        item.length > 0 &&
        !item.startsWith("/") &&
        !item.split("/").some((part) => !part || part === "." || part === ".."),
    )
  )
    throw new Error("Smoke approval list must be a JSON array of exact relative file paths");
  return approvals;
}

export function createContext(root: string, context: string, approvals: string[] = []): void {
  if (existsSync(join(root, "Dockerfile.dockerignore")))
    throw new Error("Dockerfile.dockerignore precedence is not supported by the smoke");
  const ignored = ignoredByDocker(root);
  const tracked = new Set(
    execFileSync("git", ["ls-files", "-z", "--cached"], { cwd: root, encoding: "utf8" }).split(
      "\0",
    ),
  );
  const approved = new Set(approvals);
  const files: string[] = [];
  const directories: string[] = [];
  function visit(directory: string, prefix = ""): void {
    const entries = readdirSync(directory, { withFileTypes: true });
    if (prefix && !entries.length && !approved.has(prefix))
      throw new Error(`Unapproved empty context directory: ${prefix}`);
    if (prefix) directories.push(prefix);
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (path !== "Dockerfile" && path !== ".dockerignore" && ignored(path)) continue;
      const source = join(root, path);
      const stat = lstatSync(source);
      if (stat.isDirectory()) {
        visit(source, path);
        continue;
      }
      if (!stat.isFile()) throw new Error(`Unsupported non-regular context input: ${path}`);
      if (!tracked.has(path) && !approved.has(path))
        throw new Error(
          `Unapproved working-copy input: ${path}; add its exact path to an external CALENDAR_SMOKE_ALLOWLIST`,
        );
      files.push(path);
    }
  }
  visit(root);
  for (const directory of directories) mkdirSync(join(context, directory), { recursive: true });
  for (const file of files) {
    const destination = join(context, file);
    mkdirSync(dirname(destination), { recursive: true });
    const source = join(root, file);
    const realRoot = realpathSync(root);
    if (realpathSync(dirname(source)) !== join(realRoot, dirname(file)))
      throw new Error(`Context directory changed or contains a symlink: ${file}`);
    const fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new Error(`Unsupported non-regular context input: ${file}`);
      writeFileSync(destination, readFileSync(fd), { mode: stat.mode & 0o777 });
    } finally {
      closeSync(fd);
    }
  }
}
