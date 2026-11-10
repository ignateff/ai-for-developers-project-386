export type GitHubRequest = {
  token: string;
  method?: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
};

export async function githubRequest<T>({
  token,
  method = "GET",
  path,
  body,
}: GitHubRequest): Promise<T> {
  if (!token) throw new Error("GH_TOKEN is required");

  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`GitHub API ${method} ${path} failed with ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function githubList<T>(token: string, path: string): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const result: T[] = [];

  for (let page = 1; page <= 100; page += 1) {
    const items = await githubRequest<T[]>({
      token,
      path: `${path}${separator}per_page=100&page=${page}`,
    });
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error(`GitHub API pagination exceeded 100 pages for ${path}`);
}

export function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
