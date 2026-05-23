import type { GroundingResult } from "./grounding";
import { fetchLiveContext, type LiveFetchResult } from "./live-fetch";
import { TaskRecord, ItemRecord, BriefRecord, type SourceType } from "./store";
import { clusterItemsForBriefs } from "./brief-clustering";
import { deriveTopicTags } from "./topic-tags";

export type TaskProfile = {
  keywords: string[];
  suggestedQueries: string[];
};

export type SourceRecommendation = {
  title: string;
  url: string;
  sourceType: SourceType;
};

export type SourceBundle = {
  title: string;
  description: string;
  rationale: string;
  sources: SourceRecommendation[];
};

const sourceBundleCache = new Map<string, Promise<SourceBundle[]> | SourceBundle[]>();

export type RecommendSourceBundlesOptions = {
  bypassCache?: boolean;
};

export type BriefCandidate = {
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
  itemIds: string[];
  relevanceScore: number;
  importanceScore: number;
  tags: string[];
};

export type ChatResponse = {
  content: string;
  citations: string[];
};

export type GroundedAnswer = {
  content: string;
  citations: string[];
  provenance: "stored" | "mixed";
};

// Low-dependency standard fetch completion caller for OpenAI GPT models
async function callOpenAIChatCompletion(
  messages: Array<{ role: string; content: string }>,
  jsonMode = false,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing process.env.OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.2,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const choice = result.choices?.[0]?.message?.content;
  if (!choice) {
    throw new Error("Empty choice returned from OpenAI API");
  }

  return choice;
}

// 2.1: understandTaskIntent
export async function understandTaskIntent(prompt: string): Promise<TaskProfile> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const systemPrompt = `Analyze the user's intent from their information tracking prompt.
Extract up to 5 relevant technical keywords and generate 3 highly targeted search query phrases for search engines.
Respond in strict JSON format:
{
  "keywords": ["keyword1", "keyword2"],
  "suggestedQueries": ["query one", "query two"]
}`;
      const responseText = await callOpenAIChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ], true);

      return JSON.parse(responseText) as TaskProfile;
    } catch (e) {
      console.warn("Real OpenAI failed in understandTaskIntent, falling back to mock", e);
    }
  }

  // Fallback to high-fidelity Mock Engine
  const promptLower = prompt.toLowerCase();
  if (promptLower.includes("agent") || promptLower.includes("cursor") || promptLower.includes("devin") || promptLower.includes("code")) {
    return {
      keywords: ["coding agents", "software engineering AI", "Devin AI", "Cursor IDE", "LLM code completion"],
      suggestedQueries: ["autonomous software agents benchmark", "Cursor IDE AI copilot changelog", "Devin AI vs open source alternatives"],
    };
  }

  if (promptLower.includes("funding") || promptLower.includes("invest") || promptLower.includes("yc") || promptLower.includes("venture") || promptLower.includes("startup")) {
    return {
      keywords: ["startup funding", "venture capital", "Y Combinator", "tech acquisitions", "seed rounds"],
      suggestedQueries: ["tech startup venture rounds 2026", "Y Combinator launch catalog list", "AI startups seed valuations"],
    };
  }

  if (promptLower.includes("openai") || promptLower.includes("gpt") || promptLower.includes("claude") || promptLower.includes("llm") || promptLower.includes("deepmind")) {
    return {
      keywords: ["frontier LLMs", "OpenAI GPT-5", "Claude 3.5 Sonnet", "Anthropic API", "Google DeepMind Gemini"],
      suggestedQueries: ["OpenAI developer blog updates", "frontier foundation models benchmarks", "Claude computer use safety guides"],
    };
  }

  // Default tech mock
  return {
    keywords: ["software ecosystems", "developer productivity", "emerging tech", "API engineering"],
    suggestedQueries: ["developer productivity trends 2026", "hacker news trending libraries", "new open source releases"],
  };
}

// 2.1: recommendSourceBundles
export async function recommendSourceBundles(
  prompt: string,
  options: RecommendSourceBundlesOptions = {},
): Promise<SourceBundle[]> {
  if (options.bypassCache) {
    return generateSourceBundles(prompt);
  }

  const cached = sourceBundleCache.get(prompt);
  if (cached) {
    return cached instanceof Promise ? cached : Promise.resolve(cached);
  }

  const pending = generateSourceBundles(prompt)
    .then((bundles) => {
      sourceBundleCache.set(prompt, bundles);
      return bundles;
    })
    .catch((error) => {
      sourceBundleCache.delete(prompt);
      throw error;
    });

  sourceBundleCache.set(prompt, pending);
  return pending;
}

async function generateSourceBundles(prompt: string): Promise<SourceBundle[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const systemPrompt = `You are Inflowee AI source recommendation engine. Recommend up to 2 high-quality source bundles (newsletters, RSS feeds, changelogs, web page URLs) relevant to the user's information tracking prompt.
Each bundle can have 1 to 3 actual sources. Make sure the URLs look realistic (e.g. standard developer feeds or news feeds).
Respond in strict JSON format:
{
  "bundles": [
    {
      "title": "Bundle Title",
      "description": "Short description of what these sources offer",
      "rationale": "AI rationale why these sources fit the prompt",
      "sources": [
        {
          "title": "Source Title",
          "url": "https://example.com/rss",
          "sourceType": "RSS"
        }
      ]
    }
  ]
}`;
      const responseText = await callOpenAIChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ], true);

      const parsed = JSON.parse(responseText);
      if (parsed && Array.isArray(parsed.bundles)) {
        return parsed.bundles as SourceBundle[];
      }
    } catch (e) {
      console.warn("Real OpenAI failed in recommendSourceBundles, falling back to mock", e);
    }
  }

  // Fallback to high-fidelity Mock Engine
  const promptLower = prompt.toLowerCase();
  if (promptLower.includes("agent") || promptLower.includes("cursor") || promptLower.includes("devin") || promptLower.includes("code")) {
    return [
      {
        title: "Frontier Coding Agents Bundle",
        description: "Direct tracking of autonomous developers and advanced code assistants.",
        rationale: "Directly follows the leading commercial systems (Devin, Cursor, Copilot) as they release changelogs and blogs.",
        sources: [
          {
            title: "Cognition Blog (Devin AI)",
            url: "https://cognition.labs/blog/feed",
            sourceType: "RSS",
          },
          {
            title: "Cursor Changelog & Releases",
            url: "https://cursor.sh/changelog",
            sourceType: "PAGE",
          },
          {
            title: "GitHub Next Projects",
            url: "https://githubnext.com",
            sourceType: "PAGE",
          }
        ],
      },
      {
        title: "AI Developer Tool Directories",
        description: "Community-curated lists of new coding agents and developer productivity software.",
        rationale: "Helps discover new niche open-source coding agents and tools as soon as they launch on platforms.",
        sources: [
          {
            title: "Product Hunt AI Coding Tools",
            url: "https://www.producthunt.com/topics/developer-tools",
            sourceType: "PAGE",
          },
          {
            title: "Hacker News - Show HN",
            url: "https://news.ycombinator.com/show",
            sourceType: "PAGE",
          }
        ],
      }
    ];
  }

  if (promptLower.includes("funding") || promptLower.includes("invest") || promptLower.includes("yc") || promptLower.includes("venture") || promptLower.includes("startup")) {
    return [
      {
        title: "Venture Capitals & Deal Flow",
        description: "Core tech finance publications capturing real-time funding announcements.",
        rationale: "Provides the highest volume of verified angel, seed, and VC investment round announcements.",
        sources: [
          {
            title: "TechCrunch Startups",
            url: "https://techcrunch.com/category/startups/feed",
            sourceType: "RSS",
          },
          {
            title: "PitchBook Venture News",
            url: "https://pitchbook.com/news",
            sourceType: "PAGE",
          }
        ],
      },
      {
        title: "Y Combinator Ecosystem",
        description: "Direct announcements and launch catalogs from YC active cohorts.",
        rationale: "Allows monitoring the highest-quality early-stage tech ecosystem in Silicon Valley.",
        sources: [
          {
            title: "Y Combinator Launch Directory",
            url: "https://www.ycombinator.com/launches",
            sourceType: "STRUCTURED",
          },
          {
            title: "Hacker News - Top Stories",
            url: "https://news.ycombinator.com/rss",
            sourceType: "RSS",
          }
        ],
      }
    ];
  }

  // Default OpenAI / LLM updates
  return [
    {
      title: "Frontier Foundation Lab Releases",
      description: "Primary announcements from key companies scaling foundation model capabilities.",
      rationale: "Keeps you fully up-to-date with GPT-4, Claude 3.5, and Gemini API capabilities.",
      sources: [
        {
          title: "OpenAI Official Blog",
          url: "https://openai.com/blog/feed.xml",
          sourceType: "RSS",
        },
        {
          title: "Anthropic Newsroom",
          url: "https://www.anthropic.com/news",
          sourceType: "PAGE",
        },
        {
          title: "Google DeepMind Research",
          url: "https://deepmind.google/blog/feed.xml",
          sourceType: "RSS",
        }
      ],
    }
  ];
}

// 2.2: generateBriefsFromItems (tf-idf/keyword clustering and synthesis)
export async function generateBriefsFromItems(
  task: TaskRecord,
  items: ItemRecord[]
): Promise<BriefCandidate[]> {
  if (items.length === 0) return [];

  const clusters = clusterItemsForBriefs(items);

  // Step 2: Synthesize each cluster into a BriefCandidate
  const candidates: BriefCandidate[] = [];
  const apiKey = process.env.OPENAI_API_KEY;

  for (const cluster of clusters) {
    const citations = cluster.citations;
    const itemIds = cluster.itemIds;
    const clusterItems = cluster.items;
    const relevanceScore = Math.min(1, 0.55 + clusterItems.length * 0.1);

    if (apiKey) {
      try {
        const systemPrompt = `You are Inflowee AI Synthesizer. You synthesize a set of clustered articles/updates into a single cohesive Brief for the user's tracking task.
Task Title: "${task.title}"
Task Prompt: "${task.userPrompt}"

Given the titles and summaries in this cluster, generate:
1. A concise, engaging synthesized Title (max 10 words).
2. A single comprehensive Summary paragraph digesting the unified update (max 120 words).
3. A brief "Why it Matters" paragraph explaining its context relative to the task (max 60 words).
4. A topical tag list with 5 to 15 concise tags. Prefer subject tags like remote, part-time, java, rust, ai, funding, changelog, api.

Respond in strict JSON format:
{
  "title": "Synthesized Title",
  "summary": "Full summary paragraph details...",
  "whyItMatters": "Why this update is highly relevant to tracking task...",
  "tags": ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5"]
}`;
        const clusterDetails = clusterItems.map((c) => `- TITLE: "${c.title}"\n  SUMMARY: "${c.summary || "No summary available"}"`).join("\n");
        const responseText = await callOpenAIChatCompletion([
          { role: "system", content: systemPrompt },
          { role: "user", content: `Articles to synthesize:\n${clusterDetails}` },
        ], true);

        const data = JSON.parse(responseText);
        const tags = deriveTopicTags({
          task,
          items: clusterItems,
          title: data.title || clusterItems[0].title,
          summary:
            data.summary || `Synthesized update regarding ${clusterItems[0].title}.`,
          aiTags: data.tags,
        });
        const importanceScore = Math.min(
          1,
          0.45 + clusterItems.length * 0.15 + Math.min(tags.length, 10) * 0.015,
        );
        candidates.push({
          title: data.title || clusterItems[0].title,
          summary: data.summary || `Synthesized update regarding ${clusterItems[0].title}.`,
          whyItMatters: data.whyItMatters || `Directly relates to your monitoring goal: "${task.title}".`,
          sourceCitations: citations,
          itemIds,
          relevanceScore,
          importanceScore,
          tags,
        });
        continue; // Proceed to next cluster
      } catch (e) {
        console.warn("Real OpenAI failed inside generateBriefsFromItems cluster, using mock", e);
      }
    }

    // High-fidelity Mock Synthesis fallback
    // We dynamically construct the summary based on the items in the cluster
    const lead = clusterItems[0];
    const cleanLeadTitle = lead.title.replace(/^(show hn|show|feed|news):?\s*/i, "");
    
    let synthesizedTitle = cleanLeadTitle;
    if (clusterItems.length > 1) {
      synthesizedTitle = `${cleanLeadTitle} (Multiple Reports)`;
    }

    let summaryText = lead.summary || `Latest coverage on ${cleanLeadTitle}.`;
    if (clusterItems.length > 1) {
      summaryText = `Unified coverage from ${clusterItems.length} sources: ${clusterItems.map((c) => `"${c.title}"`).join(", ")}. These updates confirm that ${cleanLeadTitle} is gaining significant traction within the industry, providing developers and operators with refined interfaces and expanded API layers.`;
    }

    // Construct relevance analysis
    let whyItMatters = `This provides immediate data points for your task: "${task.title}".`;
    const textLower = (lead.title + " " + (lead.summary ?? "")).toLowerCase();
    
    if (textLower.includes("devin") || textLower.includes("agent") || textLower.includes("cursor")) {
      whyItMatters = `AI coding assistants are evolving from single-file autocomplete tools to multi-file autonomous agents. Tracking this is critical to stay ahead in automated software engineering workflows.`;
    } else if (textLower.includes("funding") || textLower.includes("invest") || textLower.includes("million")) {
      whyItMatters = `Substantial venture capital inflows highlight the specific verticals that enterprise markets are prioritizing for automation and tooling in 2026.`;
    } else if (textLower.includes("openai") || textLower.includes("gpt") || textLower.includes("claude")) {
      whyItMatters = `Foundation model updates reset the capabilities ceiling for all downstream software. Understanding these updates allows strategic software development planning.`;
    }

    const tags = deriveTopicTags({
      task,
      items: clusterItems,
      title: synthesizedTitle,
      summary: summaryText,
    });
    const importanceScore = Math.min(
      1,
      0.45 + clusterItems.length * 0.15 + Math.min(tags.length, 10) * 0.015,
    );

    candidates.push({
      title: synthesizedTitle,
      summary: summaryText,
      whyItMatters,
      sourceCitations: citations,
      itemIds,
      relevanceScore,
      importanceScore,
      tags,
    });
  }

  return candidates;
}

// 2.3: generateChatResponse (grounded contextual chat assistant)
export async function generateChatResponse(
  messages: { role: string; content: string }[],
  briefs: BriefRecord[],
  items: ItemRecord[]
): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const systemPrompt = `You are Inflowee Grounded AI assistant. You answer user queries based STRICTLY and ONLY on the provided grounding Briefs and raw feed Items.
Cite the sources you mention by providing their canonical URLs inside your response. Do not invent any outside details that are not supported by the provided grounding files.
Return a JSON containing:
1. "content": The assistant's grounded answer written in beautiful markdown format.
2. "citations": An array of canonical URLs representing sources you cited in your answer.

Grounding Briefs:
${JSON.stringify(briefs.map((b) => ({ title: b.title, summary: b.summary, whyItMatters: b.whyItMatters, citations: b.sourceCitations })))}

Grounding Items:
${JSON.stringify(items.map((i) => ({ title: i.title, summary: i.summary, url: i.canonicalUrl })))}`;

      const responseText = await callOpenAIChatCompletion([
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ], true);

      const data = JSON.parse(responseText);
      return {
        content: data.content || "I apologize, but I could not formulate an answer.",
        citations: Array.isArray(data.citations) ? data.citations : [],
      };
    } catch (e) {
      console.warn("Real OpenAI failed in generateChatResponse, falling back to mock", e);
    }
  }

  // Fallback to high-fidelity Mock Engine
  const lastMessage = messages[messages.length - 1]?.content || "";
  const queryLower = lastMessage.toLowerCase();

  // Find all citations from grounding briefs and items to cite properly
  const allCitations = Array.from(
    new Set([
      ...briefs.flatMap((b) => b.sourceCitations || []),
      ...items.map((i) => i.canonicalUrl)
    ])
  );

  let responseContent = "";
  let matchedCitations: string[] = [];

  if (queryLower.includes("devin") || queryLower.includes("cognition")) {
    const matchingUrl = allCitations.find((c) => c.includes("cognition") || c.includes("blog")) || "https://cognition.labs/blog/introducing-devin";
    responseContent = `Based on the latest reports in this Space, **Cognition Labs** has announced significant updates regarding **Devin**, their autonomous software engineering agent.

### Key Points Grounded in Feeds:
* **Autonomy**: Devin operates inside a secure sandbox, writing, testing, and deploying full code bases.
* **Refined Benchmarks**: The reports cite substantial advances on SWE-bench, proving Devin's capabilities exceed traditional copilot autocomplete modules.

For more details, see the verified update in the [Cognition official post](${matchingUrl}).`;
    matchedCitations = [matchingUrl];
  } else if (queryLower.includes("funding") || queryLower.includes("invest") || queryLower.includes("million")) {
    const matchingUrl = allCitations.find((c) => c.includes("techcrunch") || c.includes("startup")) || "https://techcrunch.com/category/startups";
    responseContent = `The monitoring feed details key investment updates:
    
* **Seed Funding Rounds**: Startups in our feed are raising seed investments at healthy valuations.
* **AI Inflow**: Major funding rounds are concentrated primarily in advanced workflow automations and database optimization toolings.

You can follow deal tracking in the [TechCrunch Coverage](${matchingUrl}).`;
    matchedCitations = [matchingUrl];
  } else {
    // Dynamic synthesis of grounding context if no specific keywords matched
    if (briefs.length > 0) {
      const topBrief = briefs[0];
      const cited = topBrief.sourceCitations?.[0] || allCitations[0] || "https://example.com/source";
      responseContent = `Based on the grounded feeds inside this console, the core update is **"${topBrief.title}"**.

### Summary of updates:
* **Main Development**: ${topBrief.summary}
* **Relevance**: ${topBrief.whyItMatters}

You can cross-reference this information directly from [this citation](${cited}).`;
      matchedCitations = [cited];
    } else if (items.length > 0) {
      const topItem = items[0];
      const cited = topItem.canonicalUrl;
      responseContent = `Based on the temporary live context, the strongest current signal is **"${topItem.title}"**.\n\n### Summary of updates:\n* **Main Development**: ${topItem.summary ?? topItem.rawContent ?? "Fresh public-web context was captured for this topic."}\n* **Source**: ${topItem.origin ?? new URL(cited).hostname}`;
      matchedCitations = [cited];
    } else {
      responseContent = `I am ready to assist you! However, no specific active briefs or source items were found in the current grounding scope. Please ensure you have added valid sources and clicked **Sync** to pull in feed articles.`;
    }
  }

  return {
    content: responseContent,
    citations: matchedCitations,
  };
}

export async function answerGroundedQuestion(input: {
  prompt: string;
  grounding: GroundingResult;
  messages?: { role: string; content: string }[];
  liveFetchImpl?: (prompt: string) => Promise<LiveFetchResult[]>;
}): Promise<GroundedAnswer> {
  const messages = input.messages ?? [{ role: "user", content: input.prompt }];

  if (input.grounding.briefs.length > 0 || input.grounding.items.length > 0) {
    const response = await generateChatResponse(
      messages,
      input.grounding.briefs,
      input.grounding.items,
    );

    return {
      content: response.content,
      citations: response.citations,
      provenance: "stored",
    };
  }

  const liveResults = await (input.liveFetchImpl?.(input.prompt) ??
    fetchLiveContext(input.prompt));

  if (liveResults.length === 0) {
    return {
      content:
        "Stored grounding was empty and no temporary public-web context was available.",
      citations: [],
      provenance: "mixed",
    };
  }

  const liveItems: ItemRecord[] = liveResults.map((result, index) => ({
    id: `live-${index}`,
    sourceId: "live-fetch",
    title: new URL(result.url).hostname,
    canonicalUrl: result.url,
    summary: result.content,
    rawContent: result.content,
    origin: new URL(result.url).hostname,
    language: "en",
    contentHash: `live-${index}`,
    structuredFields: null,
    publishedAt: null,
    fetchedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }));
  const response = await generateChatResponse(
    messages,
    [],
    liveItems,
  );

  return {
    content: `Stored grounding was empty. Added temporary live context from public web sources.\n\n${response.content}`,
    citations:
      response.citations.length > 0
        ? response.citations
        : liveResults.map((result) => result.url),
    provenance: "mixed",
  };
}
