/// <reference types="vitest/globals" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFeedItems } from "@/lib/rss";

describe("parseFeedItems", () => {
  it("returns canonical feed items from RSS xml", () => {
    const xml = readFileSync(
      join(process.cwd(), "tests/fixtures/sample-feed.xml"),
      "utf8",
    );

    const items = parseFeedItems(xml);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Launch roundup",
      canonicalUrl: "https://example.com/posts/launch-roundup",
    });
  });
});
