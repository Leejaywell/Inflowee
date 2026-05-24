/// <reference types="vitest/globals" />

import {
  buildHtmlPublishPath,
  GitHubHtmlPublisher,
} from "@/lib/html-publisher";

describe("HTML publisher", () => {
  it("builds stable publish paths", () => {
    expect(
      buildHtmlPublishPath({
        basePath: "/inflowee/html/",
        topicTitle: "AI Coding Tools!",
        contentType: "brief",
        contentId: "Brief 123",
      }),
    ).toBe("inflowee/html/topics/ai-coding-tools/brief-brief-123.html");
  });

  it("publishes through GitHub Contents API with existing SHA", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });

      if (!init?.method) {
        return new Response(JSON.stringify({ sha: "existing-sha" }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          content: { html_url: "https://github.com/owner/repo/blob/main/file.html" },
          commit: { sha: "commit-sha" },
        }),
        { status: 200 },
      );
    };

    const publisher = new GitHubHtmlPublisher({
      token: "token",
      repo: "owner/repo",
      branch: "main",
      publicBaseUrl: "https://pages.example.com",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await publisher.publish({
      html: "<!doctype html>",
      path: "inflowee/html/topics/ai/brief-1.html",
      title: "AI brief",
      commitMessage: "Publish Inflowee HTML summary for AI brief",
    });

    expect(result).toEqual({
      url: "https://pages.example.com/inflowee/html/topics/ai/brief-1.html",
      path: "inflowee/html/topics/ai/brief-1.html",
      commitSha: "commit-sha",
    });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      branch: "main",
      message: "Publish Inflowee HTML summary for AI brief",
      sha: "existing-sha",
    });
  });

  it("throws GitHub status for failed publish", async () => {
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) =>
      !init?.method
        ? new Response("", { status: 404 })
        : new Response("bad token", { status: 401 });
    const publisher = new GitHubHtmlPublisher({
      token: "token",
      repo: "owner/repo",
      branch: "main",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      publisher.publish({
        html: "<!doctype html>",
        path: "file.html",
        title: "AI brief",
        commitMessage: "Publish Inflowee HTML summary for AI brief",
      }),
    ).rejects.toThrow("GitHub HTML publish failed: 401 bad token");
  });
});
