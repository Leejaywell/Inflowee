import { sourcePresets, type SourcePresetCategory } from "@/lib/source-presets";
import type { SourceType, TaskProfile } from "@/lib/store";

export type DiscoveryCategory = {
  id: string;
  title: string;
  description: string;
  accent: string;
  icon: string;
};

export type DiscoveryTagKind =
  | "topic"
  | "source_type"
  | "trend"
  | "language"
  | "task_relevance";

export type DiscoveryTag = {
  id: string;
  label: string;
  categoryId: string;
  kind: DiscoveryTagKind;
  weight: number;
};

export type DiscoverySourceOrigin = "preset" | "ai" | "discovery";

export type DiscoverySourceCandidate = {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceType: SourceType;
  categoryIds: string[];
  tagIds: string[];
  origin: DiscoverySourceOrigin;
  subscriberCount?: number;
  heatScore?: number;
  relevanceScore?: number;
  trendLabels: string[];
  configJson?: Record<string, unknown> | null;
};

export const discoveryCategories: DiscoveryCategory[] = [
  {
    id: "all",
    title: "全部",
    description: "所有可发现订阅源",
    accent: "bg-stone-900",
    icon: "✦",
  },
  {
    id: "technology",
    title: "科技",
    description: "AI、云平台、产品和技术新闻",
    accent: "bg-blue-600",
    icon: "⌁",
  },
  {
    id: "finance",
    title: "财经",
    description: "金融、商业、投资和市场信息",
    accent: "bg-emerald-600",
    icon: "$",
  },
  {
    id: "lifestyle",
    title: "生活",
    description: "消费、购物、内容和日常趋势",
    accent: "bg-amber-500",
    icon: "✿",
  },
  {
    id: "programming",
    title: "编程",
    description: "开发者社区、开源项目和工程实践",
    accent: "bg-sky-600",
    icon: "</>",
  },
  {
    id: "design",
    title: "设计",
    description: "产品设计、创作工具和视觉内容",
    accent: "bg-pink-500",
    icon: "◐",
  },
  {
    id: "games",
    title: "游戏",
    description: "游戏行业、社区和产品动态",
    accent: "bg-violet-600",
    icon: "◇",
  },
  {
    id: "reading",
    title: "阅读",
    description: "博客、长文、书籍和知识内容",
    accent: "bg-indigo-500",
    icon: "▤",
  },
  {
    id: "science",
    title: "科学期刊",
    description: "研究、论文和科学机构动态",
    accent: "bg-cyan-700",
    icon: "◎",
  },
  {
    id: "hiring",
    title: "招聘",
    description: "招聘网站、岗位趋势和人才市场",
    accent: "bg-orange-600",
    icon: "◧",
  },
  {
    id: "social",
    title: "社交媒体",
    description: "微博、小红书、B站和社区内容",
    accent: "bg-rose-500",
    icon: "#",
  },
  {
    id: "media",
    title: "新媒体",
    description: "新闻媒体、内容平台和热点榜单",
    accent: "bg-purple-600",
    icon: "◒",
  },
  {
    id: "forums",
    title: "论坛",
    description: "论坛讨论、问答和社区信号",
    accent: "bg-teal-600",
    icon: "●",
  },
  {
    id: "blogs",
    title: "博客",
    description: "个人博客、团队博客和专栏更新",
    accent: "bg-lime-700",
    icon: "✎",
  },
  {
    id: "audio-video",
    title: "音视频",
    description: "视频、音频、直播和创作者内容",
    accent: "bg-red-500",
    icon: "▶",
  },
  {
    id: "images",
    title: "图片",
    description: "图片社区、设计素材和视觉趋势",
    accent: "bg-fuchsia-500",
    icon: "□",
  },
  {
    id: "updates",
    title: "程序更新",
    description: "版本发布、changelog 和产品变更",
    accent: "bg-slate-600",
    icon: "↻",
  },
];

const presetCategoryMap: Record<SourcePresetCategory, string[]> = {
  "ai-official": ["technology", "programming", "updates"],
  community: ["programming", "forums", "technology"],
  "domestic-tech": ["technology", "media", "programming"],
  "content-social": ["social", "media", "lifestyle"],
  hotlist: ["media", "social", "technology"],
  "product-updates": ["updates", "technology", "programming"],
  jobs: ["hiring", "technology", "programming"],
};

const baseTags: DiscoveryTag[] = [
  { id: "trend-hot", label: "高热度", categoryId: "all", kind: "trend", weight: 95 },
  { id: "trend-rising", label: "订阅量上升", categoryId: "all", kind: "trend", weight: 88 },
  { id: "ai-recommended", label: "AI 推荐", categoryId: "all", kind: "task_relevance", weight: 90 },
  { id: "high-relevance", label: "与目标相关", categoryId: "all", kind: "task_relevance", weight: 92 },
  { id: "official", label: "官方源", categoryId: "all", kind: "source_type", weight: 80 },
  { id: "rss", label: "RSS", categoryId: "all", kind: "source_type", weight: 76 },
  { id: "rsshub", label: "RSSHub", categoryId: "all", kind: "source_type", weight: 74 },
  { id: "community", label: "社区讨论", categoryId: "all", kind: "source_type", weight: 72 },
  { id: "search", label: "搜索发现", categoryId: "all", kind: "source_type", weight: 70 },
  { id: "hotlist", label: "热榜", categoryId: "all", kind: "trend", weight: 78 },
  { id: "chinese", label: "中文内容", categoryId: "all", kind: "language", weight: 68 },
  { id: "english", label: "英文内容", categoryId: "all", kind: "language", weight: 66 },
  { id: "ai", label: "AI", categoryId: "technology", kind: "topic", weight: 95 },
  { id: "cloud", label: "云平台", categoryId: "technology", kind: "topic", weight: 72 },
  { id: "startup", label: "创业公司", categoryId: "finance", kind: "topic", weight: 70 },
  { id: "funding", label: "投融资", categoryId: "finance", kind: "topic", weight: 82 },
  { id: "consumer", label: "消费趋势", categoryId: "lifestyle", kind: "topic", weight: 70 },
  { id: "shopping", label: "购物", categoryId: "lifestyle", kind: "topic", weight: 68 },
  { id: "opensource", label: "开源项目", categoryId: "programming", kind: "topic", weight: 86 },
  { id: "developer", label: "开发者", categoryId: "programming", kind: "topic", weight: 84 },
  { id: "product-design", label: "产品设计", categoryId: "design", kind: "topic", weight: 74 },
  { id: "creator", label: "创作者", categoryId: "design", kind: "topic", weight: 66 },
  { id: "remote-jobs", label: "远程岗位", categoryId: "hiring", kind: "topic", weight: 82 },
  { id: "china-jobs", label: "国内招聘", categoryId: "hiring", kind: "topic", weight: 80 },
  { id: "weibo", label: "微博", categoryId: "social", kind: "source_type", weight: 72 },
  { id: "bilibili", label: "B站", categoryId: "audio-video", kind: "source_type", weight: 70 },
  { id: "blogs", label: "团队博客", categoryId: "blogs", kind: "source_type", weight: 76 },
  { id: "release-notes", label: "Release Notes", categoryId: "updates", kind: "source_type", weight: 82 },
];

function normalize(value: string) {
  return value.toLowerCase();
}

function sourceTypeTags(sourceType: SourceType) {
  if (sourceType === "RSS") {
    return ["rss"];
  }
  if (sourceType === "UPDATE") {
    return ["release-notes", "official"];
  }
  if (sourceType === "COMMUNITY_DISCOVERY") {
    return ["community", "search"];
  }
  if (sourceType === "SOCIAL_DISCOVERY") {
    return ["search"];
  }
  if (sourceType === "HOTLIST_DISCOVERY") {
    return ["hotlist", "trend-hot"];
  }
  if (sourceType === "SEARCH_DISCOVERY") {
    return ["search"];
  }
  return [];
}

function inferPresetTags(input: {
  title: string;
  description: string;
  url: string;
  categoryIds: string[];
  sourceType: SourceType;
}) {
  const text = normalize(`${input.title} ${input.description} ${input.url}`);
  const tags = new Set<string>([
    ...input.categoryIds,
    ...sourceTypeTags(input.sourceType),
  ]);

  if (text.includes("ai") || text.includes("claude") || text.includes("openai")) {
    tags.add("ai");
  }
  if (text.includes("github") || text.includes("open-source")) {
    tags.add("opensource");
  }
  if (text.includes("changelog") || text.includes("release")) {
    tags.add("release-notes");
  }
  if (text.includes("job") || text.includes("招聘")) {
    tags.add("remote-jobs");
  }
  if (/[\u4e00-\u9fff]/.test(input.title + input.description)) {
    tags.add("chinese");
  } else {
    tags.add("english");
  }

  return [...tags];
}

function keywordScore(text: string, profile?: TaskProfile | null) {
  if (!profile) {
    return 0;
  }

  const normalizedText = normalize(text);
  return profile.keywords.reduce((score, keyword) => {
    return normalizedText.includes(normalize(keyword)) ? score + 1 : score;
  }, 0);
}

export function getDiscoveryCategories() {
  return discoveryCategories;
}

export function getDiscoveryTags(
  categoryId: string,
  profile?: TaskProfile | null,
): DiscoveryTag[] {
  const categoryTags = baseTags.filter(
    (tag) => tag.categoryId === "all" || tag.categoryId === categoryId,
  );
  const taskTags =
    profile?.keywords.slice(0, 8).map((keyword, index) => ({
      id: `task-${keyword.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")}`,
      label: keyword,
      categoryId,
      kind: "task_relevance" as const,
      weight: 100 - index,
    })) ?? [];

  return [...taskTags, ...categoryTags].sort(
    (a, b) => b.weight - a.weight || a.label.localeCompare(b.label),
  );
}

export function getDiscoveryTagBatch(
  tags: DiscoveryTag[],
  batchIndex: number,
  batchSize = 12,
) {
  if (tags.length <= batchSize) {
    return tags;
  }

  const start = (batchIndex * batchSize) % tags.length;
  const ordered = [...tags.slice(start), ...tags.slice(0, start)];
  return ordered.slice(0, batchSize);
}

export function mapSourcePresetsToDiscoveryCandidates(
  profile?: TaskProfile | null,
): DiscoverySourceCandidate[] {
  return sourcePresets.map((preset, index) => {
    const categoryIds = ["all", ...(presetCategoryMap[preset.category] ?? [])];
    const tagIds = inferPresetTags({
      title: preset.title,
      description: preset.description,
      url: preset.url,
      categoryIds,
      sourceType: preset.sourceType,
    });
    const relevanceBoost = keywordScore(
      `${preset.title} ${preset.description}`,
      profile,
    );
    const sourceTypeHeat =
      preset.sourceType === "HOTLIST_DISCOVERY"
        ? 30
        : preset.sourceType.includes("DISCOVERY")
          ? 20
          : 0;
    const subscriberCount = 900 + ((index * 137) % 3200);
    const heatScore = Math.min(100, 45 + sourceTypeHeat + relevanceBoost * 12);
    const relevanceScore = Math.min(1, 0.35 + relevanceBoost * 0.18);
    const trendLabels = [
      ...(heatScore >= 70 ? ["高热度"] : []),
      ...(relevanceScore >= 0.7 ? ["与目标相关"] : []),
      ...(preset.sourceType === "RSS" || preset.sourceType === "UPDATE"
        ? ["官方源"]
        : []),
      ...(preset.sourceType.includes("DISCOVERY") ? ["搜索发现"] : []),
    ];

    return {
      id: `preset:${preset.id}`,
      title: preset.title,
      description: preset.description,
      url: preset.url,
      sourceType: preset.sourceType,
      categoryIds,
      tagIds,
      origin: "preset",
      subscriberCount,
      heatScore,
      relevanceScore,
      trendLabels,
      configJson: preset.configJson ?? null,
    };
  });
}

export function buildTaskAiCandidates(
  profile?: TaskProfile | null,
): DiscoverySourceCandidate[] {
  if (!profile?.keywords.length) {
    return [];
  }

  return profile.keywords.slice(0, 2).map((keyword, index) => ({
    id: `ai:topic:${index}`,
    title: `${keyword} AI 推荐源`,
    description: "根据当前监控目标关键词补充的 AI 推荐订阅源。",
    url: `radar://search-discovery/ai-${index}`,
    sourceType: "SEARCH_DISCOVERY",
    categoryIds: ["all", "technology", "media"],
    tagIds: ["ai-recommended", "high-relevance", "search"],
    origin: "ai" as const,
    heatScore: 76 - index * 3,
    relevanceScore: 0.86 - index * 0.04,
    trendLabels: ["AI 推荐", "与目标相关"],
    configJson: null,
  }));
}

export function buildTaskDiscoveryCandidates(
  profile?: TaskProfile | null,
): DiscoverySourceCandidate[] {
  if (!profile?.suggestedQueries.length) {
    return [];
  }

  return profile.suggestedQueries.slice(0, 3).map((query, index) => ({
    id: `discovery:search:${index}`,
    title: `${query} 搜索发现`,
    description: "根据当前监控目标生成的动态搜索发现源。",
    url: "radar://search-discovery/task",
    sourceType: "SEARCH_DISCOVERY",
    categoryIds: ["all", "technology", "media"],
    tagIds: ["ai-recommended", "high-relevance", "search", "trend-hot"],
    origin: "discovery" as const,
    heatScore: 82 - index * 4,
    relevanceScore: 0.9 - index * 0.05,
    trendLabels: ["AI 推荐", "与目标相关", "搜索发现"],
    configJson: null,
  }));
}

export function getDiscoverySourceCandidates(
  profile?: TaskProfile | null,
) {
  return [
    ...buildTaskAiCandidates(profile),
    ...buildTaskDiscoveryCandidates(profile),
    ...mapSourcePresetsToDiscoveryCandidates(profile),
  ].sort((a, b) => {
    const aScore = (a.heatScore ?? 0) + (a.relevanceScore ?? 0) * 100;
    const bScore = (b.heatScore ?? 0) + (b.relevanceScore ?? 0) * 100;
    return bScore - aScore || a.title.localeCompare(b.title);
  });
}

export function filterDiscoverySourceCandidates(input: {
  candidates: DiscoverySourceCandidate[];
  categoryId: string;
  selectedTagIds: string[];
}) {
  const selectedTagIds = new Set(input.selectedTagIds);

  return input.candidates.filter((candidate) => {
    const categoryMatches =
      input.categoryId === "all" || candidate.categoryIds.includes(input.categoryId);
    const tagMatches =
      selectedTagIds.size === 0 ||
      candidate.tagIds.some((tagId) => selectedTagIds.has(tagId));

    return categoryMatches && tagMatches;
  });
}
