import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createTopicRecord,
  createStore,
  listTopics,
  markBriefRead,
  markSourceSyncResult,
} from "../src/lib/store.ts";
import { loadDevEnv } from "./load-dev-env.ts";

loadDevEnv();

async function main() {
  const store = createStore();

  if ((await listTopics(store)).length > 0) {
    console.log("Database already has data. Skip seeding.");
    process.exit(0);
  }

  const topicModelsId = await createTopicRecord(store, {
    title: "Frontier Model Launches",
    topicType: "TOPIC",
    userPrompt:
      "Monitor new model releases, pricing adjustments, and API benchmarks from OpenAI and Anthropic.",
  });

  const srcOpenAi = await createSourceRecord(store, {
    topicId: topicModelsId,
    sourceType: "PAGE",
    title: "OpenAI Newsroom",
    url: "https://openai.com/newsroom",
  });

  const srcAnthropic = await createSourceRecord(store, {
    topicId: topicModelsId,
    sourceType: "PAGE",
    title: "Anthropic News & Insights",
    url: "https://www.anthropic.com/news",
  });

  const topicOpenSourceAiId = await createTopicRecord(store, {
    title: "Open Source AI & Research",
    topicType: "TOPIC",
    userPrompt:
      "Track academic research publications and open weights model releases (Llama, Gemma).",
  });

  const srcDeepMind = await createSourceRecord(store, {
    topicId: topicOpenSourceAiId,
    sourceType: "PAGE",
    title: "Google DeepMind Discover",
    url: "https://deepmind.google/discover/blog",
  });

  const srcMetaAi = await createSourceRecord(store, {
    topicId: topicOpenSourceAiId,
    sourceType: "PAGE",
    title: "Meta AI Blog",
    url: "https://ai.meta.com/blog",
  });

  const topicTrendsId = await createTopicRecord(store, {
    title: "Venture Trends & Dev Sentiment",
    topicType: "TOPIC",
    userPrompt:
      "Track venture capital trends and developer reactions to coding agents and toolchains.",
  });

  const srcHackerNews = await createSourceRecord(store, {
    topicId: topicTrendsId,
    sourceType: "RSS",
    title: "Hacker News Feed",
    url: "https://news.ycombinator.com/rss",
  });

  const srcTechCrunch = await createSourceRecord(store, {
    topicId: topicTrendsId,
    sourceType: "RSS",
    title: "TechCrunch Startups",
    url: "https://techcrunch.com/feed/",
  });

  const topicLaunchesId = await createTopicRecord(store, {
    title: "Product Launches & Tools",
    topicType: "TOPIC",
    userPrompt:
      "Scan launch platforms for new independent software tools and developer accessories.",
  });

  const srcProductHunt = await createSourceRecord(store, {
    topicId: topicLaunchesId,
    sourceType: "STRUCTURED",
    title: "Product Hunt",
    url: "https://www.producthunt.com/",
  });

  const srcYCombinator = await createSourceRecord(store, {
    topicId: topicLaunchesId,
    sourceType: "STRUCTURED",
    title: "YC Startup Launches",
    url: "https://www.ycombinator.com/launches",
  });

  const nowStr = new Date().toISOString();

  const itemGpt4o = await createItemRecordResult(store, {
    sourceId: srcOpenAi,
    title: "OpenAI Launches GPT-4o-mini",
    canonicalUrl: "https://openai.com/newsroom/gpt-4o-mini",
    summary:
      "OpenAI has introduced GPT-4o-mini, its most cost-efficient and capable small model to date, targeting high-volume developer workflows.",
    publishedAt: nowStr,
  });

  const itemClaude35 = await createItemRecordResult(store, {
    sourceId: srcAnthropic,
    title: "Anthropic Introduces Claude 3.5 Sonnet",
    canonicalUrl: "https://www.anthropic.com/news/claude-3-5-sonnet",
    summary:
      "Anthropic released Claude 3.5 Sonnet, establishing new industry benchmarks for graduate-level reasoning and autonomous coding capabilities.",
    publishedAt: nowStr,
  });

  const itemDevinFunding = await createItemRecordResult(store, {
    sourceId: srcTechCrunch,
    title: "Cognition Labs Raises Funding at $2B Valuation",
    canonicalUrl: "https://techcrunch.com/2026/devin-funding",
    summary:
      "Cognition Labs, creators of the Devin autonomous AI software engineer, raised fresh financing to expand its research and scale engineering fleets.",
    publishedAt: nowStr,
  });

  const itemHnDevin = await createItemRecordResult(store, {
    sourceId: srcHackerNews,
    title: "Devin: The First Autonomous AI Software Engineer",
    canonicalUrl: "https://news.ycombinator.com/item?id=39661000",
    summary:
      "A lively discussion on Hacker News analyzing the real-world capabilities and technical architectural breakthroughs of the Devin coding agent.",
    publishedAt: nowStr,
  });

  const itemProductHuntAi = await createItemRecordResult(store, {
    sourceId: srcProductHunt,
    title: "Bolt.new: Fullstack Web App Generator in Browser",
    canonicalUrl: "https://www.producthunt.com/posts/bolt-new",
    summary:
      "Bolt.new launches in-browser fullstack AI generation powered by WebContainers, allowing instant compilation and deployment.",
    publishedAt: nowStr,
  });

  if (itemGpt4o && itemClaude35) {
    await createBriefRecord(store, {
      topicId: topicModelsId,
      title: "Frontier AI Pricing Wars & Performance Milestones",
      summary:
        "OpenAI and Anthropic have simultaneously updated their product lineups. OpenAI released GPT-4o-mini to establish pricing supremacy in cost-efficient APIs, while Anthropic launched Claude 3.5 Sonnet, setting new quality benchmarks for autonomous coding topics.",
      whyItMatters:
        "Developers now have access to cheaper, faster planning intelligence, making high-volume agentic loops highly viable from both performance and margin standpoints.",
      sourceCitations: [itemGpt4o.canonicalUrl, itemClaude35.canonicalUrl],
      itemIds: [itemGpt4o.id, itemClaude35.id],
    });
  }

  if (itemDevinFunding && itemHnDevin) {
    await createBriefRecord(store, {
      topicId: topicTrendsId,
      title: "Autonomous Coding Agents Attract Capital Amid Community Debate",
      summary:
        "Cognition Labs locked in a major financing round valuing the startup at $2B, following the rollout of Devin. Hacker News threads show intense debate, with engineers analyzing product capabilities while raising long-term concerns over career paths.",
      whyItMatters:
        "Coding automation is transitioning rapidly from autocompletes to fully agentic workflows, drawing massive investor confidence and shifting developer sentiment.",
      sourceCitations: [
        itemDevinFunding.canonicalUrl,
        itemHnDevin.canonicalUrl,
      ],
      itemIds: [itemDevinFunding.id, itemHnDevin.id],
    });
  }

  if (itemProductHuntAi) {
    const briefId = await createBriefRecord(store, {
      topicId: topicLaunchesId,
      title: "Fullstack Sandbox-in-Browser Tech Gains Ground",
      summary:
        "Bolt.new topped Product Hunt rankings, highlighting a growing trend towards complete in-browser sandboxed development platforms that run complete node servers inside the user browser.",
      whyItMatters:
        "Lowering friction for prototype deployment and visual sandbox interactions empowers faster software iterations directly inside local environments.",
      sourceCitations: [itemProductHuntAi.canonicalUrl],
      itemIds: [itemProductHuntAi.id],
    });
    await markBriefRead(store, briefId);
  }

  const allSourceIds = [
    srcOpenAi,
    srcAnthropic,
    srcDeepMind,
    srcMetaAi,
    srcHackerNews,
    srcTechCrunch,
    srcProductHunt,
    srcYCombinator,
  ];

  for (const sourceId of allSourceIds) {
    await markSourceSyncResult(store, {
      sourceId,
      status: "success",
    });
  }

  console.log(
    "Seeded personal topics, sources, and grounded briefs successfully.",
  );
}

await main();
