export type PublishHtmlInput = {
  html: string;
  path: string;
  title: string;
  commitMessage: string;
};

export type PublishHtmlResult = {
  url: string;
  path: string;
  commitSha?: string;
};

export type HtmlPublisher = {
  publish(input: PublishHtmlInput): Promise<PublishHtmlResult>;
};

type FetchLike = typeof fetch;

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return slug || "topic";
}

function encodeBase64Utf8(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

export function buildHtmlPublishPath(input: {
  basePath: string;
  topicTitle: string;
  contentType: "brief" | "report";
  contentId: string;
}): string {
  return [
    trimSlashes(input.basePath),
    "topics",
    slugify(input.topicTitle),
    `${input.contentType}-${slugify(input.contentId)}.html`,
  ]
    .filter(Boolean)
    .join("/");
}

export class GitHubHtmlPublisher implements HtmlPublisher {
  private readonly token: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly publicBaseUrl: string | null;
  private readonly fetchImpl: FetchLike;

  constructor(config: {
    token: string;
    repo: string;
    branch: string;
    publicBaseUrl?: string | null;
    fetchImpl?: FetchLike;
  }) {
    this.token = config.token;
    this.repo = config.repo;
    this.branch = config.branch;
    this.publicBaseUrl = config.publicBaseUrl ?? null;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async publish(input: PublishHtmlInput): Promise<PublishHtmlResult> {
    const encodedPath = input.path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const endpoint = `https://api.github.com/repos/${this.repo}/contents/${encodedPath}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const existing = await this.fetchImpl(`${endpoint}?ref=${this.branch}`, {
      headers,
    });
    let sha: string | undefined;

    if (existing.ok) {
      const body = (await existing.json()) as { sha?: string };
      sha = body.sha;
    } else if (existing.status !== 404) {
      const errorText = await existing.text();
      throw new Error(`GitHub content lookup failed: ${existing.status} ${errorText}`);
    }

    const response = await this.fetchImpl(endpoint, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        branch: this.branch,
        message: input.commitMessage,
        content: encodeBase64Utf8(input.html),
        ...(sha ? { sha } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub HTML publish failed: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as {
      content?: { html_url?: string };
      commit?: { sha?: string };
    };
    const url = this.publicBaseUrl
      ? `${trimSlashes(this.publicBaseUrl)}/${input.path}`
      : (result.content?.html_url ??
        `https://github.com/${this.repo}/blob/${this.branch}/${input.path}`);

    return {
      url,
      path: input.path,
      commitSha: result.commit?.sha,
    };
  }
}
