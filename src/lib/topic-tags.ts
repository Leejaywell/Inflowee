import type { ItemRecord, TopicRecord } from "@/lib/store";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "about",
  "that",
  "this",
  "latest",
  "new",
  "news",
  "update",
  "updates",
  "launch",
  "launches",
  "release",
  "releases",
  "announces",
  "announced",
  "jobs",
  "job",
  "role",
  "roles",
  "team",
  "work",
  "using",
  "build",
  "building",
  "based",
  "today",
  "roundup",
  "week",
  "daily",
]);

const KEYWORD_TAGS: Array<{ tag: string; match: RegExp }> = [
  { tag: "remote", match: /\bremote\b|远程/ },
  { tag: "hybrid", match: /\bhybrid\b/ },
  { tag: "onsite", match: /\bonsite\b|\bon-site\b|现场/ },
  { tag: "part-time", match: /\bpart[\s-]?time\b|兼职/ },
  { tag: "full-time", match: /\bfull[\s-]?time\b|全职/ },
  { tag: "contract", match: /\bcontract\b|合同工/ },
  { tag: "hiring", match: /\bhiring\b|\bcareers?\b|\brecruit(ing)?\b|招聘/ },
  { tag: "jobs", match: /\bjobs?\b|职位/ },
  { tag: "startup", match: /\bstartup\b|\bstartups\b/ },
  { tag: "funding", match: /\bfunding\b|\bseries [abc]\b|\braised\b|\binvestment\b|融资/ },
  { tag: "salary", match: /\bsalary\b|\bcompensation\b|薪资/ },
  { tag: "developer-tools", match: /\bdeveloper\b|\bdevtools?\b|\bsdk\b|\bcli\b|\bframework\b/ },
  { tag: "api", match: /\bapi\b/ },
  { tag: "open-source", match: /\bopen[\s-]?source\b/ },
  { tag: "changelog", match: /\bchangelog\b|\brelease notes?\b|\bwhat'?s new\b/ },
  { tag: "product-update", match: /\bupdates?\b|\breleases?\b|\brollout\b|\bshipping\b|\blaunch(?:es)?\b|更新/ },
  { tag: "ai", match: /\bai\b|人工智能/ },
  { tag: "llm", match: /\bllm\b|\blarge language model\b/ },
  { tag: "agent", match: /\bagent\b|\bagents\b|\bautonomous\b/ },
  { tag: "coding-agent", match: /\bcoding agent\b|\bcode agent\b|\bswe-bench\b/ },
  { tag: "model", match: /\bmodel\b|\bmodels\b/ },
  { tag: "benchmark", match: /\bbenchmark\b|\bswe-bench\b/ },
  { tag: "security", match: /\bsecurity\b|\bvulnerability\b|\bcve\b|安全/ },
  { tag: "research", match: /\bresearch\b|\bpaper\b|\bstudy\b|研究/ },
  { tag: "newsletter", match: /\bnewsletter\b/ },
  { tag: "telegram", match: /\btelegram\b|\bt\.me\b/ },
  { tag: "slack", match: /\bslack\b/ },
  { tag: "feishu", match: /\bfeishu\b|\blark\b|飞书/ },
  { tag: "openai", match: /\bopenai\b|\bgpt-?\d|\bchatgpt\b/ },
  { tag: "anthropic", match: /\banthropic\b|\bclaude\b/ },
  { tag: "deepmind", match: /\bdeepmind\b|\bgoogle ai\b/ },
  { tag: "vercel", match: /\bvercel\b/ },
  { tag: "supabase", match: /\bsupabase\b/ },
  { tag: "prisma", match: /\bprisma\b/ },
  { tag: "github", match: /\bgithub\b/ },
  { tag: "hacker-news", match: /\bhacker news\b|\bhn\b/ },
  { tag: "y-combinator", match: /\by combinator\b|\byc\b/ },
  { tag: "java", match: /\bjava\b/ },
  { tag: "rust", match: /\brust\b/ },
  { tag: "python", match: /\bpython\b/ },
  { tag: "golang", match: /\bgo\b|\bgolang\b/ },
  { tag: "typescript", match: /\btypescript\b/ },
  { tag: "javascript", match: /\bjavascript\b|\bnode\.?js\b/ },
  { tag: "react", match: /\breact\b/ },
  { tag: "nextjs", match: /\bnext\.?js\b/ },
  { tag: "kubernetes", match: /\bkubernetes\b|\bk8s\b/ },
  { tag: "docker", match: /\bdocker\b/ },
];

const FALLBACK_TAGS = [
  "industry-watch",
  "software",
  "monitoring",
  "tracked-topic",
  "signal",
  "web",
  "product",
  "engineering",
];

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function addTag(tags: string[], tag: string) {
  if (!tags.includes(tag)) {
    tags.push(tag);
  }
}

function normalizeOpenAiTags(tags: string[] | null | undefined) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) =>
      tag
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9+#.\-\s]/g, "")
        .replace(/\s+/g, "-"),
    )
    .filter((tag) => tag.length >= 2);
}

function inferBaseTags(text: string, topic?: Pick<TopicRecord, "title" | "userPrompt"> | null) {
  const tags: string[] = [];

  for (const rule of KEYWORD_TAGS) {
    if (rule.match.test(text)) {
      addTag(tags, rule.tag);
    }
  }

  if (topic) {
    for (const token of tokenize(`${topic.title} ${topic.userPrompt}`)) {
      if (token.length >= 4) {
        addTag(tags, token.replace(/\./g, "").replace(/\s+/g, "-"));
      }
      if (tags.length >= 10) {
        break;
      }
    }
  }

  for (const token of tokenize(text)) {
    const normalized = token.replace(/\./g, "").replace(/\s+/g, "-");
    if (
      normalized.length >= 3 &&
      normalized.length <= 24 &&
      !tags.includes(normalized) &&
      !STOP_WORDS.has(normalized)
    ) {
      addTag(tags, normalized);
    }
    if (tags.length >= 15) {
      break;
    }
  }

  for (const fallback of FALLBACK_TAGS) {
    if (tags.length >= 5) {
      break;
    }
    addTag(tags, fallback);
  }

  return tags.slice(0, 15);
}

export function deriveTopicTags({
  topic,
  items,
  title,
  summary,
  aiTags,
}: {
  topic?: Pick<TopicRecord, "title" | "userPrompt"> | null;
  items: Array<
    Pick<
      ItemRecord,
      "title" | "summary" | "origin" | "canonicalUrl" | "rawContent" | "structuredFields"
    >
  >;
  title: string;
  summary: string;
  aiTags?: string[] | null;
}) {
  const clusterText = items
    .map((item) =>
      [
        item.title,
        item.summary ?? "",
        item.rawContent ?? "",
        item.structuredFields ? JSON.stringify(item.structuredFields) : "",
      ].join(" "),
    )
    .join(" ");

  const fullText = `${title} ${summary} ${clusterText} ${topic?.title ?? ""} ${topic?.userPrompt ?? ""}`.toLowerCase();
  const merged: string[] = [];

  for (const tag of normalizeOpenAiTags(aiTags)) {
    addTag(merged, tag);
  }

  for (const tag of inferBaseTags(fullText, topic ?? null)) {
    addTag(merged, tag);
  }

  if (merged.length < 5) {
    for (const fallback of FALLBACK_TAGS) {
      addTag(merged, fallback);
      if (merged.length >= 5) {
        break;
      }
    }
  }

  return merged.slice(0, 15);
}
