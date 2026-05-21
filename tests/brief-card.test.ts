/// <reference types="vitest/globals" />

import { BriefCard } from "@/lib/brief-card";
import type { BriefRecord } from "@/lib/store";

describe("BriefCard", () => {
  const baseBrief: BriefRecord = {
    id: "brief-1",
    taskId: "task-1",
    title: "Launch roundup",
    summary: "Latest launches and product updates from the AI coding agent space.",
    whyItMatters: "New signal captured from subscribed RSS sources.",
    sourceCitations: ["https://example.com/posts/launch-roundup"],
    isRead: false,
    createdAt: "2026-05-21T08:00:00.000Z",
    taskTitle: "Agent launches",
    spaceName: "AI Watch",
  };

  it("returns a valid React element with expected content", () => {
    const element = BriefCard({ brief: baseBrief });

    expect(element).toBeTruthy();
    expect(element.type).toBe("div");

    const rendered = JSON.stringify(element);
    expect(rendered).toContain("Launch roundup");
    expect(rendered).toContain("AI Watch");
    expect(rendered).toContain("Inflowee");
    expect(rendered).toContain("Why it matters");
    // Source count is rendered as children array [1, " source", ""]
    expect(rendered).toContain('"children":[1," source",""]');
  });

  it("truncates long summaries", () => {
    const longSummary = "A".repeat(250);
    const element = BriefCard({
      brief: { ...baseBrief, summary: longSummary },
    });

    const rendered = JSON.stringify(element);
    expect(rendered).toContain("...");
    expect(rendered).not.toContain("A".repeat(250));
  });

  it("handles multiple source citations", () => {
    const element = BriefCard({
      brief: {
        ...baseBrief,
        sourceCitations: [
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c",
        ],
      },
    });

    const rendered = JSON.stringify(element);
    // Source count is rendered as children array [3, " source", "s"]
    expect(rendered).toContain('"children":[3," source","s"]');
  });
});
