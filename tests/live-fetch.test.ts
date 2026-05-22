/// <reference types="vitest/globals" />

import { fetchLiveContext } from "@/lib/live-fetch";

describe("fetchLiveContext", () => {
  it("caps live fetch to a small public set", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      return new Response(
        `<html><head><title>${href}</title></head><body><main><p>Fresh update for ${href}</p></main></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    });

    const results = await fetchLiveContext("OpenAI changelog updates", {
      fetchImpl: fetchImpl as typeof fetch,
      searchResults: [
        "https://openai.com/changelog",
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ],
    });

    expect(results).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(results[0]?.url).toBe("https://openai.com/changelog");
  });

  it("filters out non-public or non-https URLs before fetching", async () => {
    const fetchImpl = vi.fn();

    const results = await fetchLiveContext("ignore local urls", {
      fetchImpl: fetchImpl as typeof fetch,
      searchResults: [
        "http://example.com/plain-http",
        "https://localhost/private",
        "https://example.com/ok",
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(0);
  });
});
