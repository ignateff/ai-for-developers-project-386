import { execFileSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";

const rootFiles = new Set([
  "Dockerfile",
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "version.txt",
]);
const sourceFile =
  /^(apps\/(api|web)|generated)\/(?!.*(?:^|\/)\.)[^\n]+\.(?:ts|tsx|js|mjs|json|html|css|svg|sql|yaml)$/;
const secretName =
  /(?:^|[._/-])(?:secret|secrets|credential|credentials|password|private-key|token)(?:[._/-]|$)/i;

// Only build inputs are copied. Docker still applies the checkout's .dockerignore.
export function createContext(root: string, context: string): void {
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  ).split("\0");
  for (const file of new Set(files)) {
    if (!rootFiles.has(file) && (!sourceFile.test(file) || secretName.test(file))) continue;
    const source = join(root, file);
    let stat;
    try {
      let parent = root;
      for (const part of file.split("/").slice(0, -1)) {
        parent += sep + part;
        if (lstatSync(parent).isSymbolicLink())
          throw new Error(`Refusing symlink in build input: ${file}`);
      }
      stat = lstatSync(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!stat.isFile()) throw new Error(`Refusing non-regular build input: ${file}`);
    const destination = join(context, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
}
