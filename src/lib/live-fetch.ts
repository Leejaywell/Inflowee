import { extractPageContent } from "@/lib/page-extract";

export type LiveFetchResult = {
  url: string;
  content: string;
};

type LiveFetchOptions = {
  fetchImpl?: typeof fetch;
  searchResults?: string[];
};

const MAX_LIVE_RESULTS = 3;

export async function fetchLiveContext(
  prompt: string,
  options: LiveFetchOptions = {},
): Promise<LiveFetchResult[]> {
  const urls = (options.searchResults ?? getFallbackUrls(prompt))
    .filter(isAllowedLiveFetchUrl)
    .slice(0, MAX_LIVE_RESULTS);
  const fetchImpl = options.fetchImpl ?? fetch;

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) {
          return null;
        }

        const html = await response.text();
        const page = extractPageContent(html, url);
        const content = [page.title, page.summary].filter(Boolean).join("\n\n");

        return {
          url: page.canonicalUrl,
          content: content.slice(0, 4000),
        };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((result): result is LiveFetchResult => Boolean(result));
}

function getFallbackUrls(prompt: string): string[] {
  const promptLower = prompt.toLowerCase();

  if (promptLower.includes("openai")) {
    return [
      "https://openai.com/news/",
      "https://platform.openai.com/docs/changelog",
    ];
  }

  if (promptLower.includes("anthropic") || promptLower.includes("claude")) {
    return ["https://www.anthropic.com/news"];
  }

  if (promptLower.includes("cursor")) {
    return ["https://cursor.sh/changelog"];
  }

  if (promptLower.includes("github")) {
    return ["https://github.blog/changelog/"];
  }

  return [];
}

function isAllowedLiveFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
