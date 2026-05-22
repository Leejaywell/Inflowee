/// <reference types="vitest/globals" />

import { understandTaskIntent, recommendSourceBundles, generateBriefsFromItems, generateChatResponse } from "@/lib/ai";
import { TaskRecord, ItemRecord, BriefRecord } from "@/lib/store";

describe("Core AI Orchestration layer", () => {
  it("extracts task profiles from prompt text via intent mock", async () => {
    const profile = await understandTaskIntent("Track OpenAI ChatGPT launches and Claude API updates");
    
    expect(profile.keywords).toContain("frontier LLMs");
    expect(profile.suggestedQueries[0]).toContain("OpenAI developer blog");
  });

  it("extracts coding agent task profiles via intent mock", async () => {
    const profile = await understandTaskIntent("Monitor autonomous coding agents devin cursor");
    
    expect(profile.keywords).toContain("coding agents");
    expect(profile.suggestedQueries).toContain("Devin AI vs open source alternatives");
  });

  it("recommends source bundles based on prompt keywords", async () => {
    const bundles = await recommendSourceBundles("I want to track funding deals of VC startups");
    
    expect(bundles).toHaveLength(2);
    expect(bundles[0].title).toBe("Venture Capitals & Deal Flow");
    expect(bundles[0].sources[0].title).toBe("TechCrunch Startups");
  });

  it("memoizes source bundle recommendations for identical prompts", async () => {
    const first = await recommendSourceBundles("Track Devin and Cursor coding agents");
    const second = await recommendSourceBundles("Track Devin and Cursor coding agents");

    expect(second).toBe(first);
  });

  it("bypasses memoized source bundle recommendations when requested", async () => {
    const first = await recommendSourceBundles("Track Devin and Cursor coding agents");
    const refreshed = await recommendSourceBundles("Track Devin and Cursor coding agents", {
      bypassCache: true,
    });

    expect(refreshed).not.toBe(first);
    expect(refreshed).toEqual(first);
  });

  it("clusters feed items by Jaccard title-similarity and generates synthesized brief candidates", async () => {
    const mockTask: TaskRecord = {
      id: "task-1",
      spaceId: "space-1",
      title: "Monitor Devin releases",
      taskType: "TOPIC",
      userPrompt: "Follow autonomous software developers",
      relevanceLevel: 3,
      summaryPreference: "balanced",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockItems: ItemRecord[] = [
      {
        id: "item-1",
        sourceId: "src-1",
        title: "Cognition announces Devin software assistant updates",
        canonicalUrl: "https://cognition.labs/blog/devin-updates-1",
        summary: "Cognition released major capabilities enhancements to the Devin system.",
        rawContent: "Cognition released major capabilities enhancements to the Devin system.",
        origin: "cognition.labs",
        language: "en",
        contentHash: "hash-1",
        structuredFields: null,
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: "item-2",
        sourceId: "src-1",
        title: "Cognition introduces updates to Devin autonomous software assistant",
        canonicalUrl: "https://cognition.labs/blog/devin-updates-2",
        summary: "Autonomous engineering assistants get refined SWE-bench capabilities.",
        rawContent: "Autonomous engineering assistants get refined SWE-bench capabilities.",
        origin: "cognition.labs",
        language: "en",
        contentHash: "hash-2",
        structuredFields: null,
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: "item-3",
        sourceId: "src-2",
        title: "TechCrunch Series A funding results for SaaS",
        canonicalUrl: "https://techcrunch.com/saas-funding-news",
        summary: "SaaS startups are receiving massive investments this week.",
        rawContent: "SaaS startups are receiving massive investments this week.",
        origin: "techcrunch.com",
        language: "en",
        contentHash: "hash-3",
        structuredFields: null,
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
    ];

    const briefs = await generateBriefsFromItems(mockTask, mockItems);

    // Should create 2 clusters:
    // Cluster 1: item-1 and item-2 (Devin updates, Jaccard title similarity > 0.25)
    // Cluster 2: item-3 (TechCrunch Series A)
    expect(briefs).toHaveLength(2);

    const devinBrief = briefs.find((b) => b.title.includes("Devin"));
    expect(devinBrief).toBeDefined();
    expect(devinBrief?.itemIds).toContain("item-1");
    expect(devinBrief?.itemIds).toContain("item-2");
    expect(devinBrief?.sourceCitations).toContain("https://cognition.labs/blog/devin-updates-1");
    expect(devinBrief?.sourceCitations).toContain("https://cognition.labs/blog/devin-updates-2");
    expect(devinBrief?.whyItMatters).toContain("AI coding assistants are evolving");

    const fundingBrief = briefs.find((b) => b.title.includes("Series A"));
    expect(fundingBrief).toBeDefined();
    expect(fundingBrief?.itemIds).toEqual(["item-3"]);
  });

  it("produces grounded contextual chat responses citing relevant articles", async () => {
    const mockBriefs: BriefRecord[] = [
      {
        id: "brief-1",
        taskId: "task-1",
        title: "Devin updates announced",
        summary: "Autonomous coding agent achieves SWE-bench progress.",
        whyItMatters: "Advancements redefine autocompletes.",
        sourceCitations: ["https://cognition.labs/blog/devin"],
        isRead: false,
        createdAt: new Date().toISOString(),
      }
    ];

    const mockItems: ItemRecord[] = [
      {
        id: "item-1",
        sourceId: "src-1",
        title: "Devin software helper post",
        canonicalUrl: "https://cognition.labs/blog/devin",
        summary: "Autonomy is scaling.",
        rawContent: "Autonomy is scaling.",
        origin: "cognition.labs",
        language: "en",
        contentHash: "hash-4",
        structuredFields: null,
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
    ];

    const messages = [
      { role: "user", content: "What updates were announced for Devin?" }
    ];

    const response = await generateChatResponse(messages, mockBriefs, mockItems);
    
    expect(response.content).toContain("Cognition Labs");
    expect(response.content).toContain("Devin");
    expect(response.citations).toEqual(["https://cognition.labs/blog/devin"]);
  });
});
