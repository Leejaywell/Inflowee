/// <reference types="vitest/globals" />

import { deriveTopicTags } from "@/lib/topic-tags";

describe("deriveTopicTags", () => {
  it("extracts deeper hiring and language topic tags", () => {
    const tags = deriveTopicTags({
      task: {
        title: "Track remote backend jobs",
        userPrompt: "Monitor remote and part-time Java or Rust openings",
      },
      items: [
        {
          title: "Remote Part-Time Java / Rust Backend Engineer",
          summary: "Hiring startup seeks remote contractor with Java and Rust experience.",
          origin: "remotejobscn.com",
          canonicalUrl: "https://remotejobscn.com/jobs/backend-engineer",
          rawContent: null,
          structuredFields: {
            company: "Acme",
            location: "Remote",
            type: "Part-time",
          },
        },
      ],
      title: "Remote Part-Time Java / Rust Backend Engineer",
      summary: "Hiring startup seeks remote contractor with Java and Rust experience.",
    });

    expect(tags).toContain("remote");
    expect(tags).toContain("part-time");
    expect(tags).toContain("java");
    expect(tags).toContain("rust");
    expect(tags).toContain("hiring");
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(tags.length).toBeLessThanOrEqual(15);
  });

  it("backfills stable topic tags when source text is sparse", () => {
    const tags = deriveTopicTags({
      items: [
        {
          title: "Launch roundup",
          summary: "Latest launches and product updates.",
          origin: "example.com",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          rawContent: null,
          structuredFields: null,
        },
      ],
      title: "Launch roundup",
      summary: "Latest launches and product updates.",
    });

    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(tags.length).toBeLessThanOrEqual(15);
    expect(tags).toContain("product-update");
  });
});
