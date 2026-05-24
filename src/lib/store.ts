import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Prisma, PrismaClient } from "@prisma/client";

import { getDatabaseUrl, getPrisma, requireDatabaseUrl } from "./db.ts";
import type { TopicScheduleProfile } from "./topic-schedule";

export type TopicType = "TOPIC" | "QUESTION";
export type ReportMode = "current" | "daily" | "incremental";
export type SourceType =
  | "RSS"
  | "PAGE"
  | "STRUCTURED"
  | "UPDATE"
  | "NEWSLETTER"
  | "TELEGRAM_PUBLIC"
  | "TELEGRAM_BOT"
  | "SEARCH_DISCOVERY"
  | "COMMUNITY_DISCOVERY"
  | "SOCIAL_DISCOVERY"
  | "HOTLIST_DISCOVERY";
export type SourceStatus = "idle" | "success" | "error";
export type SyncRunStatus = "running" | "success" | "error";
export type DeliveryStatus = "running" | "success" | "error";
export type HtmlPushEntitlementStatus =
  | "available"
  | "disabled"
  | "upgrade_required";
export type HtmlPushStylePreset =
  | "minimal_news"
  | "tech_radar"
  | "investment_brief"
  | "newsletter"
  | "magazine_cards";
export type HtmlPushModulePreset =
  | "standard_summary"
  | "analysis_report"
  | "news_flash";
export type HtmlPushModule =
  | "summary"
  | "key_content"
  | "ai_conclusion"
  | "trend_changes"
  | "citations"
  | "original_links"
  | "recommended_actions";
export type HtmlPublicationStatus =
  | "pending"
  | "generated"
  | "published"
  | "failed";
export type HtmlDeliveryStatus =
  | "skipped"
  | "pending"
  | "published"
  | "failed";
export type SqliteStore = {
  runtime: "sqlite";
  database: DatabaseSync;
  prisma?: undefined;
};
export type PrismaStore = {
  runtime: "prisma";
  database: DatabaseSync;
  prisma: PrismaClient;
};
export type Store = SqliteStore | PrismaStore;

function createUnavailableDatabaseHandle(): DatabaseSync {
  return new Proxy({} as DatabaseSync, {
    get() {
      throw new Error("SQLite database is unavailable for Prisma-backed store.");
    },
  });
}

function createUnavailablePrismaHandle(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get() {
      throw new Error("DATABASE_URL is required for cloud runtime.");
    },
  });
}

type TopicRow = {
  id: string;
  owner_id: string;
  title: string;
  topic_type: TopicType;
  user_prompt: string;
  relevance_level: number;
  summary_preference: string;
  topic_profile: string | null;
  schedule_profile: string | null;
  delivery_channels: string | null;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  id: string;
  topic_id: string;
  source_type: SourceType;
  title: string;
  url: string;
  config_json: string | null;
  status: SourceStatus;
  last_synced_at: string | null;
  last_error: string | null;
  sync_interval_minutes: number;
  next_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

type SyncRunRow = {
  id: string;
  source_id: string;
  status: SyncRunStatus;
  inserted_item_count: number;
  created_brief_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

type DeliveryLogRow = {
  id: string;
  brief_id: string | null;
  content_type: string | null;
  content_id: string | null;
  endpoint: string;
  payload_type: DeliveryPayloadType;
  status: DeliveryStatus;
  attempt_count: number | null;
  response_status: number | null;
  error: string | null;
  html_publication_id: string | null;
  html_url: string | null;
  html_status: HtmlDeliveryStatus | null;
  started_at: string;
  finished_at: string | null;
};

type HtmlPushConfigRow = {
  id: string;
  owner_id: string;
  enabled: number;
  entitlement_status: HtmlPushEntitlementStatus;
  style_preset: HtmlPushStylePreset;
  module_preset: HtmlPushModulePreset;
  enabled_modules_json: string;
  custom_prompt: string | null;
  publish_target: "github";
  github_token_encrypted: string | null;
  github_repo: string | null;
  github_branch: string;
  github_base_path: string;
  public_base_url: string | null;
  created_at: string;
  updated_at: string;
};

type TopicHtmlPushConfigRow = {
  id: string;
  topic_id: string;
  use_global: number;
  enabled: number;
  style_preset: HtmlPushStylePreset;
  module_preset: HtmlPushModulePreset;
  enabled_modules_json: string;
  custom_prompt: string | null;
  created_at: string;
  updated_at: string;
};

type HtmlPublicationRow = {
  id: string;
  owner_id: string;
  topic_id: string;
  brief_id: string | null;
  report_id: string | null;
  content_type: "brief" | "report";
  content_id: string;
  delivery_log_id: string | null;
  status: HtmlPublicationStatus;
  title: string | null;
  html: string | null;
  html_url: string | null;
  publish_target: "github";
  publish_path: string | null;
  commit_sha: string | null;
  error: string | null;
  style_config_json: string;
  module_config_json: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type ItemRow = {
  id: string;
  source_id: string;
  title: string;
  canonical_url: string;
  summary: string | null;
  raw_content: string | null;
  origin: string | null;
  language: string | null;
  content_hash: string;
  structured_fields: string | null;
  is_real: number | null;
  relevance_score: number | null;
  relevance_reason: string | null;
  keyword_mentioned: number | null;
  matched_terms: string | null;
  quality_status: string;
  quality_error: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  reply_count: number | null;
  repost_count: number | null;
  source_native_score: number | null;
  author_name: string | null;
  author_username: string | null;
  author_followers: number | null;
  author_verified: number | null;
  published_at: string | null;
  fetched_at: string;
  created_at: string;
};

type BriefRow = {
  id: string;
  topic_id: string;
  title: string;
  summary: string;
  why_it_matters: string;
  source_citations: string;
  relevance_score: number;
  importance_score: number;
  tags_json: string;
  is_read: number;
  created_at: string;
  topic_title?: string;
};

type ReportRow = {
  id: string;
  topic_id: string;
  mode: ReportMode;
  title: string;
  summary: string;
  content_json: string;
  markdown: string;
  item_ids: string;
  brief_ids: string;
  source_citations: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  topic_title?: string;
};

type RecommendationBundleRow = {
  id: string;
  topic_id: string;
  position: number;
  bundle_json: string;
  created_at: string;
  updated_at: string;
};

export type ChatThreadRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  citations: string | null;
  provenance: "stored" | "mixed" | null;
  created_at: string;
};

export type TopicProfile = {
  keywords: string[];
  suggestedQueries: string[];
};

export type RecommendationSource = {
  title: string;
  url: string;
  sourceType: SourceType;
};

export type RecommendationBundle = {
  title: string;
  description: string;
  rationale: string;
  sources: RecommendationSource[];
};

export type TopicRecord = {
  id: string;
  ownerId: string;
  title: string;
  topicType: TopicType;
  userPrompt: string;
  relevanceLevel: number;
  summaryPreference: string;
  topicProfile?: TopicProfile | null;
  scheduleProfile?: TopicScheduleProfile | null;
  deliveryChannels?: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceRecord = {
  id: string;
  topicId: string;
  sourceType: SourceType;
  title: string;
  url: string;
  configJson: Record<string, unknown> | null;
  status: SourceStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncRunRecord = {
  id: string;
  sourceId: string;
  status: SyncRunStatus;
  insertedItemCount: number;
  createdBriefCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type WebhookSettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type SlackSettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type TelegramSettingsRecord = {
  botToken: string | null;
  chatId: string | null;
  updatedAt: string | null;
};

export type FeishuSettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type NtfySettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type DefaultDeliveryChannelsRecord = {
  channels: string[];
  updatedAt: string | null;
};

export type DeliveryTemplateRecord = {
  template: string | null;
  updatedAt: string | null;
};

export type DeliveryPayloadType =
  | "html"
  | "slack"
  | "telegram"
  | "feishu"
  | "ntfy"
  | "dingtalk"
  | "wecom"
  | "bark"
  | "email";

export type DeliveryLogRecord = {
  id: string;
  briefId: string | null;
  contentType: string;
  contentId: string | null;
  endpoint: string;
  payloadType: DeliveryPayloadType;
  status: DeliveryStatus;
  attemptCount: number | null;
  responseStatus: number | null;
  error: string | null;
  htmlPublicationId: string | null;
  htmlUrl: string | null;
  htmlStatus: HtmlDeliveryStatus | null;
  startedAt: string;
  finishedAt: string | null;
};

export type HtmlPushConfigRecord = {
  id: string;
  ownerId: string;
  enabled: boolean;
  entitlementStatus: HtmlPushEntitlementStatus;
  stylePreset: HtmlPushStylePreset;
  modulePreset: HtmlPushModulePreset;
  enabledModules: HtmlPushModule[];
  customPrompt: string | null;
  publishTarget: "github";
  githubTokenEncrypted: string | null;
  githubRepo: string | null;
  githubBranch: string;
  githubBasePath: string;
  publicBaseUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TopicHtmlPushConfigRecord = {
  id: string;
  topicId: string;
  useGlobal: boolean;
  enabled: boolean;
  stylePreset: HtmlPushStylePreset;
  modulePreset: HtmlPushModulePreset;
  enabledModules: HtmlPushModule[];
  customPrompt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HtmlPublicationRecord = {
  id: string;
  ownerId: string;
  topicId: string;
  briefId: string | null;
  reportId: string | null;
  contentType: "brief" | "report";
  contentId: string;
  deliveryLogId: string | null;
  status: HtmlPublicationStatus;
  title: string | null;
  html: string | null;
  htmlUrl: string | null;
  publishTarget: "github";
  publishPath: string | null;
  commitSha: string | null;
  error: string | null;
  styleConfig: Record<string, unknown>;
  moduleConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type SaveHtmlPushConfigInput = {
  ownerId: string;
  enabled: boolean;
  entitlementStatus?: HtmlPushEntitlementStatus;
  stylePreset: HtmlPushStylePreset;
  modulePreset: HtmlPushModulePreset;
  enabledModules: HtmlPushModule[];
  customPrompt?: string | null;
  publishTarget?: "github";
  githubTokenEncrypted?: string | null;
  githubRepo?: string | null;
  githubBranch?: string;
  githubBasePath?: string;
  publicBaseUrl?: string | null;
};

export type SaveTopicHtmlPushConfigInput = {
  topicId: string;
  useGlobal: boolean;
  enabled: boolean;
  stylePreset: HtmlPushStylePreset;
  modulePreset: HtmlPushModulePreset;
  enabledModules: HtmlPushModule[];
  customPrompt?: string | null;
};

export type CreateHtmlPublicationInput = {
  ownerId: string;
  topicId: string;
  briefId?: string | null;
  reportId?: string | null;
  contentType: "brief" | "report";
  contentId: string;
  deliveryLogId?: string | null;
  status?: HtmlPublicationStatus;
  title?: string | null;
  html?: string | null;
  htmlUrl?: string | null;
  publishTarget?: "github";
  publishPath?: string | null;
  commitSha?: string | null;
  error?: string | null;
  styleConfig?: Record<string, unknown>;
  moduleConfig?: Record<string, unknown>;
  publishedAt?: string | null;
};

export type UpdateHtmlPublicationInput = Partial<
  Pick<
    HtmlPublicationRecord,
    | "deliveryLogId"
    | "status"
    | "title"
    | "html"
    | "htmlUrl"
    | "publishPath"
    | "commitSha"
    | "error"
    | "styleConfig"
    | "moduleConfig"
    | "publishedAt"
  >
>;

export type SourceHealthSummary = {
  total: number;
  healthy: number;
  errored: number;
  idle: number;
  dueNow: number;
};

export type DeliveryHealthSummary = {
  total: number;
  success: number;
  error: number;
  running: number;
  webhookConfigured: boolean;
  slackConfigured: boolean;
  telegramConfigured: boolean;
  feishuConfigured: boolean;
  ntfyConfigured: boolean;
};

export type ItemRecord = {
  id: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent: string | null;
  origin: string | null;
  language: string | null;
  contentHash: string;
  structuredFields: Record<string, unknown> | null;
  isReal: boolean | null;
  relevanceScore: number | null;
  relevanceReason: string | null;
  keywordMentioned: boolean | null;
  matchedTerms: string[] | null;
  qualityStatus: "pending" | "accepted" | "rejected" | "error";
  qualityError: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  replyCount: number | null;
  repostCount: number | null;
  sourceNativeScore: number | null;
  authorName: string | null;
  authorUsername: string | null;
  authorFollowers: number | null;
  authorVerified: boolean | null;
  publishedAt: string | null;
  fetchedAt: string;
  createdAt: string;
};

export type BriefRecord = {
  id: string;
  topicId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
  relevanceScore: number;
  importanceScore: number;
  tags: string[];
  isRead: boolean;
  createdAt: string;
  topicTitle?: string;
};

export type ReportRecord = {
  id: string;
  topicId: string;
  mode: ReportMode;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  markdown: string;
  itemIds: string[];
  briefIds: string[];
  sourceCitations: string[];
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  topicTitle?: string;
};

export type ChatThreadRecord = {
  id: string;
  scopeType: "global" | "topic" | "brief";
  scopeId: string;
  createdAt: string;
};

export type ChatMessageRecord = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  citations: string[] | null;
  provenance: "stored" | "mixed" | null;
  createdAt: string;
};

type CreateTopicInput = {
  ownerId?: string;
  title: string;
  topicType: TopicType;
  userPrompt: string;
};

const sourceStatusConstraint = "CHECK(status IN ('idle', 'success', 'error'))";
const sourceTypeSql =
  "'RSS', 'PAGE', 'STRUCTURED', 'UPDATE', 'NEWSLETTER', 'TELEGRAM_PUBLIC', 'TELEGRAM_BOT', 'SEARCH_DISCOVERY', 'COMMUNITY_DISCOVERY', 'SOCIAL_DISCOVERY', 'HOTLIST_DISCOVERY'";
const sourceTableDefinition = `
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN (${sourceTypeSql})),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    config_json TEXT,
    status TEXT NOT NULL DEFAULT 'idle' ${sourceStatusConstraint},
    last_synced_at TEXT,
    last_error TEXT,
    sync_interval_minutes INTEGER NOT NULL DEFAULT 360,
    next_sync_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
  );
`;

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    configJson: row.config_json
      ? (JSON.parse(row.config_json) as Record<string, unknown>)
      : null,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    syncIntervalMinutes: row.sync_interval_minutes,
    nextSyncAt: row.next_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncRun(row: SyncRunRow): SyncRunRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    insertedItemCount: row.inserted_item_count,
    createdBriefCount: row.created_brief_count,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapDeliveryLog(row: DeliveryLogRow): DeliveryLogRecord {
  return {
    id: row.id,
    briefId: row.brief_id,
    contentType: row.content_type ?? "brief",
    contentId: row.content_id ?? row.brief_id,
    endpoint: row.endpoint,
    payloadType: row.payload_type,
    status: row.status,
    attemptCount: row.attempt_count,
    responseStatus: row.response_status,
    error: row.error,
    htmlPublicationId: row.html_publication_id,
    htmlUrl: row.html_url,
    htmlStatus: row.html_status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapHtmlPushConfig(row: HtmlPushConfigRow): HtmlPushConfigRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    enabled: Boolean(row.enabled),
    entitlementStatus: row.entitlement_status,
    stylePreset: row.style_preset,
    modulePreset: row.module_preset,
    enabledModules: JSON.parse(row.enabled_modules_json) as HtmlPushModule[],
    customPrompt: row.custom_prompt,
    publishTarget: row.publish_target,
    githubTokenEncrypted: row.github_token_encrypted,
    githubRepo: row.github_repo,
    githubBranch: row.github_branch,
    githubBasePath: row.github_base_path,
    publicBaseUrl: row.public_base_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTopicHtmlPushConfig(
  row: TopicHtmlPushConfigRow,
): TopicHtmlPushConfigRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    useGlobal: Boolean(row.use_global),
    enabled: Boolean(row.enabled),
    stylePreset: row.style_preset,
    modulePreset: row.module_preset,
    enabledModules: JSON.parse(row.enabled_modules_json) as HtmlPushModule[],
    customPrompt: row.custom_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHtmlPublication(row: HtmlPublicationRow): HtmlPublicationRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    topicId: row.topic_id,
    briefId: row.brief_id,
    reportId: row.report_id,
    contentType: row.content_type,
    contentId: row.content_id,
    deliveryLogId: row.delivery_log_id,
    status: row.status,
    title: row.title,
    html: row.html,
    htmlUrl: row.html_url,
    publishTarget: row.publish_target,
    publishPath: row.publish_path,
    commitSha: row.commit_sha,
    error: row.error,
    styleConfig: JSON.parse(row.style_config_json) as Record<string, unknown>,
    moduleConfig: JSON.parse(row.module_config_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    summary: row.summary,
    rawContent: row.raw_content,
    origin: row.origin,
    language: row.language,
    contentHash: row.content_hash,
    structuredFields: row.structured_fields
      ? (JSON.parse(row.structured_fields) as Record<string, unknown>)
      : null,
    isReal: row.is_real === null ? null : Boolean(row.is_real),
    relevanceScore: row.relevance_score,
    relevanceReason: row.relevance_reason,
    keywordMentioned:
      row.keyword_mentioned === null ? null : Boolean(row.keyword_mentioned),
    matchedTerms: row.matched_terms
      ? (JSON.parse(row.matched_terms) as string[])
      : null,
    qualityStatus: row.quality_status as ItemRecord["qualityStatus"],
    qualityError: row.quality_error,
    viewCount: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    replyCount: row.reply_count,
    repostCount: row.repost_count,
    sourceNativeScore: row.source_native_score,
    authorName: row.author_name,
    authorUsername: row.author_username,
    authorFollowers: row.author_followers,
    authorVerified:
      row.author_verified === null ? null : Boolean(row.author_verified),
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
  };
}

function mapBrief(row: BriefRow): BriefRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    sourceCitations: JSON.parse(row.source_citations) as string[],
    relevanceScore: row.relevance_score,
    importanceScore: row.importance_score,
    tags: JSON.parse(row.tags_json) as string[],
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    topicTitle: row.topic_title,
  };
}

function mapReport(row: ReportRow): ReportRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    mode: row.mode,
    title: row.title,
    summary: row.summary,
    content: JSON.parse(row.content_json) as Record<string, unknown>,
    markdown: row.markdown,
    itemIds: JSON.parse(row.item_ids) as string[],
    briefIds: JSON.parse(row.brief_ids) as string[],
    sourceCitations: JSON.parse(row.source_citations) as string[],
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    topicTitle: row.topic_title,
  };
}

function mapRecommendationBundle(
  row: RecommendationBundleRow,
): RecommendationBundle {
  return JSON.parse(row.bundle_json) as RecommendationBundle;
}

function mapChatThread(row: ChatThreadRow): ChatThreadRecord {
  return {
    id: row.id,
    scopeType: row.scope_type as "global" | "topic" | "brief",
    scopeId: row.scope_id,
    createdAt: row.created_at,
  };
}

function mapChatMessage(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    citations: row.citations ? (JSON.parse(row.citations) as string[]) : null,
    provenance: row.provenance,
    createdAt: row.created_at,
  };
}

function migrateSourcesTable(database: DatabaseSync) {
  const sourcesTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sources'",
    )
    .get() as { sql: string } | undefined;

  if (!sourcesTable) {
    return;
  }

  const needsStatusMigration = !sourcesTable.sql.includes(sourceStatusConstraint);
  const needsStructuredMigration = !sourcesTable.sql.includes("'STRUCTURED'");
  const needsUpdateMigration = !sourcesTable.sql.includes("'UPDATE'");
  const needsNewsletterMigration = !sourcesTable.sql.includes("'NEWSLETTER'");
  const needsTelegramPublicMigration = !sourcesTable.sql.includes("'TELEGRAM_PUBLIC'");
  const needsTelegramBotMigration = !sourcesTable.sql.includes("'TELEGRAM_BOT'");
  const needsDiscoveryMigration = !sourcesTable.sql.includes("'SEARCH_DISCOVERY'");
  const needsHotlistMigration = !sourcesTable.sql.includes("'HOTLIST_DISCOVERY'");
  const needsConfigMigration = !sourcesTable.sql.includes("config_json");
  const needsScheduleMigration = !sourcesTable.sql.includes("sync_interval_minutes");

  if (
    !needsStatusMigration &&
    !needsStructuredMigration &&
    !needsUpdateMigration &&
    !needsNewsletterMigration &&
    !needsTelegramPublicMigration &&
    !needsTelegramBotMigration &&
    !needsDiscoveryMigration &&
    !needsHotlistMigration &&
    !needsConfigMigration &&
    !needsScheduleMigration
  ) {
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE sources_migrated (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN (${sourceTypeSql})),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      config_json TEXT,
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'success', 'error')),
      last_synced_at TEXT,
      last_error TEXT,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 360,
      next_sync_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    INSERT INTO sources_migrated (
      id,
      topic_id,
      source_type,
      title,
      url,
      config_json,
      status,
      last_synced_at,
      last_error,
      sync_interval_minutes,
      next_sync_at,
      created_at,
      updated_at
    )
    SELECT
      id,
      topic_id,
      CASE
        WHEN source_type IN (${sourceTypeSql}) THEN source_type
        ELSE 'PAGE'
      END,
      title,
      url,
      NULL,
      CASE
        WHEN status IN ('idle', 'success', 'error') THEN status
        ELSE 'error'
      END,
      last_synced_at,
      last_error,
      360,
      created_at,
      created_at,
      updated_at
    FROM sources;

    DROP TABLE sources;
    ALTER TABLE sources_migrated RENAME TO sources;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateSyncRunsTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      inserted_item_count INTEGER NOT NULL DEFAULT 0,
      created_brief_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
    );
  `);
}

function hasColumn(database: DatabaseSync, tableName: string, columnName: string) {
  return (
    database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>
  ).some((column) => column.name === columnName);
}

function migrateDeliveryLogsTable(database: DatabaseSync) {
  const deliveryLogsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'delivery_logs'",
    )
    .get() as { sql: string } | undefined;

  if (deliveryLogsTable && !hasColumn(database, "delivery_logs", "attempt_count")) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN attempt_count INTEGER;");
  }

  if (
    deliveryLogsTable &&
    !hasColumn(database, "delivery_logs", "response_status")
  ) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN response_status INTEGER;");
  }

  if (
    deliveryLogsTable &&
    !hasColumn(database, "delivery_logs", "html_publication_id")
  ) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN html_publication_id TEXT;");
  }

  if (deliveryLogsTable && !hasColumn(database, "delivery_logs", "html_url")) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN html_url TEXT;");
  }

  if (deliveryLogsTable && !hasColumn(database, "delivery_logs", "html_status")) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN html_status TEXT;");
  }

  const needsDeliveryPayloadUpgrade =
    deliveryLogsTable &&
    (!deliveryLogsTable.sql.includes("'email'") ||
      !deliveryLogsTable.sql.includes("content_type") ||
      deliveryLogsTable.sql.includes("brief_id TEXT NOT NULL"));

  if (needsDeliveryPayloadUpgrade) {
    const contentTypeSelect = deliveryLogsTable.sql.includes("content_type")
      ? "content_type"
      : "'brief'";
    const contentIdSelect = deliveryLogsTable.sql.includes("content_id")
      ? "content_id"
      : "brief_id";

    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE delivery_logs_migrated (
        id TEXT PRIMARY KEY,
        brief_id TEXT,
        content_type TEXT NOT NULL DEFAULT 'brief',
        content_id TEXT,
        endpoint TEXT NOT NULL,
        payload_type TEXT NOT NULL CHECK(payload_type IN ('html', 'slack', 'telegram', 'feishu', 'ntfy', 'dingtalk', 'wecom', 'bark', 'email')),
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        attempt_count INTEGER,
        response_status INTEGER,
        error TEXT,
        html_publication_id TEXT,
        html_url TEXT,
        html_status TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
      );

      INSERT INTO delivery_logs_migrated (
        id,
        brief_id,
        content_type,
        content_id,
        endpoint,
        payload_type,
        status,
        attempt_count,
        response_status,
        error,
        html_publication_id,
        html_url,
        html_status,
        started_at,
        finished_at
      )
      SELECT
        id,
        brief_id,
        ${contentTypeSelect},
        ${contentIdSelect},
        endpoint,
        payload_type,
        status,
        attempt_count,
        response_status,
        error,
        NULL,
        NULL,
        NULL,
        started_at,
        finished_at
      FROM delivery_logs;

      DROP TABLE delivery_logs;
      ALTER TABLE delivery_logs_migrated RENAME TO delivery_logs;

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      brief_id TEXT,
      content_type TEXT NOT NULL DEFAULT 'brief',
      content_id TEXT,
      endpoint TEXT NOT NULL,
      payload_type TEXT NOT NULL CHECK(payload_type IN ('html', 'slack', 'telegram', 'feishu', 'ntfy', 'dingtalk', 'wecom', 'bark', 'email')),
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      attempt_count INTEGER,
      response_status INTEGER,
      error TEXT,
      html_publication_id TEXT,
      html_url TEXT,
      html_status TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at
      ON delivery_logs(brief_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_content_started_at
      ON delivery_logs(content_type, content_id, started_at DESC);
  `);

  if (deliveryLogsTable && !deliveryLogsTable.sql.includes("attempt_count")) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN attempt_count INTEGER;");
  }
}

function migrateHtmlPushTables(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS html_push_configs (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 0,
      entitlement_status TEXT NOT NULL DEFAULT 'available',
      style_preset TEXT NOT NULL DEFAULT 'minimal_news',
      module_preset TEXT NOT NULL DEFAULT 'standard_summary',
      enabled_modules_json TEXT NOT NULL,
      custom_prompt TEXT,
      publish_target TEXT NOT NULL DEFAULT 'github',
      github_token_encrypted TEXT,
      github_repo TEXT,
      github_branch TEXT NOT NULL DEFAULT 'main',
      github_base_path TEXT NOT NULL DEFAULT 'inflowee/html',
      public_base_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topic_html_push_configs (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL UNIQUE,
      use_global INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 0,
      style_preset TEXT NOT NULL DEFAULT 'minimal_news',
      module_preset TEXT NOT NULL DEFAULT 'standard_summary',
      enabled_modules_json TEXT NOT NULL,
      custom_prompt TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS html_publications (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      brief_id TEXT,
      report_id TEXT,
      content_type TEXT NOT NULL CHECK(content_type IN ('brief', 'report')),
      content_id TEXT NOT NULL,
      delivery_log_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'generated', 'published', 'failed')),
      title TEXT,
      html TEXT,
      html_url TEXT,
      publish_target TEXT NOT NULL DEFAULT 'github',
      publish_path TEXT,
      commit_sha TEXT,
      error TEXT,
      style_config_json TEXT NOT NULL,
      module_config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE,
      FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE,
      FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
      UNIQUE(content_type, content_id)
    );

    CREATE INDEX IF NOT EXISTS idx_html_publications_owner_created_at
      ON html_publications(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_html_publications_topic_created_at
      ON html_publications(topic_id, created_at DESC);
  `);
}

function migrateBriefsTable(database: DatabaseSync) {
  const briefsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'briefs'",
    )
    .get() as { sql: string } | undefined;

  if (!briefsTable) {
    return;
  }

  const needsIsRead = !briefsTable.sql.includes("is_read");
  const needsScores = !briefsTable.sql.includes("relevance_score");

  if (!needsIsRead && !needsScores) {
    return;
  }

  if (!needsScores) {
    database.exec("ALTER TABLE briefs ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;");
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE briefs_migrated (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      source_citations TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      importance_score REAL NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    INSERT INTO briefs_migrated (
      id,
      topic_id,
      title,
      summary,
      why_it_matters,
      source_citations,
      relevance_score,
      importance_score,
      tags_json,
      is_read,
      created_at
    )
    SELECT
      id,
      topic_id,
      title,
      summary,
      why_it_matters,
      source_citations,
      0.5,
      0.5,
      '[]',
      CASE WHEN instr(sql, 'is_read') > 0 THEN is_read ELSE 0 END,
      created_at
    FROM briefs
    CROSS JOIN (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'briefs');

    DROP TABLE briefs;
    ALTER TABLE briefs_migrated RENAME TO briefs;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateBriefReadsTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS brief_reads (
      brief_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (brief_id, actor_id),
      FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_brief_reads_actor_read_at
      ON brief_reads(actor_id, read_at DESC);
  `);
}

function migrateLegacyTopicSchema(database: DatabaseSync) {
  const legacyTopicsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
    )
    .get() as { sql: string } | undefined;

  if (legacyTopicsTable) {
    database.exec(`
      INSERT OR IGNORE INTO topics (
        id,
        owner_id,
        title,
        topic_type,
        user_prompt,
        relevance_level,
        summary_preference,
        topic_profile,
        schedule_profile,
        delivery_channels,
        created_at,
        updated_at
      )
      SELECT
        id,
        owner_id,
        title,
        task_type,
        user_prompt,
        relevance_level,
        summary_preference,
        task_profile,
        schedule_profile,
        delivery_channels,
        created_at,
        updated_at
      FROM tasks;
    `);
  }

  if (hasColumn(database, "sources", "task_id") && !hasColumn(database, "sources", "topic_id")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE sources_migrated (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN (${sourceTypeSql})),
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        config_json TEXT,
        status TEXT NOT NULL DEFAULT 'idle' ${sourceStatusConstraint},
        last_synced_at TEXT,
        last_error TEXT,
        sync_interval_minutes INTEGER NOT NULL DEFAULT 360,
        next_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      INSERT INTO sources_migrated (
        id,
        topic_id,
        source_type,
        title,
        url,
        config_json,
        status,
        last_synced_at,
        last_error,
        sync_interval_minutes,
        next_sync_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        task_id,
        source_type,
        title,
        url,
        config_json,
        status,
        last_synced_at,
        last_error,
        sync_interval_minutes,
        next_sync_at,
        created_at,
        updated_at
      FROM sources;

      DROP TABLE sources;
      ALTER TABLE sources_migrated RENAME TO sources;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  if (hasColumn(database, "briefs", "task_id") && !hasColumn(database, "briefs", "topic_id")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE briefs_migrated (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_it_matters TEXT NOT NULL,
        source_citations TEXT NOT NULL,
        relevance_score REAL NOT NULL DEFAULT 0,
        importance_score REAL NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      INSERT INTO briefs_migrated (
        id,
        topic_id,
        title,
        summary,
        why_it_matters,
        source_citations,
        relevance_score,
        importance_score,
        tags_json,
        is_read,
        created_at
      )
      SELECT
        id,
        task_id,
        title,
        summary,
        why_it_matters,
        source_citations,
        relevance_score,
        importance_score,
        tags_json,
        is_read,
        created_at
      FROM briefs;

      DROP TABLE briefs;
      ALTER TABLE briefs_migrated RENAME TO briefs;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  if (hasColumn(database, "reports", "task_id") && !hasColumn(database, "reports", "topic_id")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE reports_migrated (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('current', 'daily', 'incremental')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content_json TEXT NOT NULL,
        markdown TEXT NOT NULL,
        item_ids TEXT NOT NULL DEFAULT '[]',
        brief_ids TEXT NOT NULL DEFAULT '[]',
        source_citations TEXT NOT NULL DEFAULT '[]',
        period_start TEXT,
        period_end TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      INSERT INTO reports_migrated (
        id,
        topic_id,
        mode,
        title,
        summary,
        content_json,
        markdown,
        item_ids,
        brief_ids,
        source_citations,
        period_start,
        period_end,
        created_at
      )
      SELECT
        id,
        task_id,
        mode,
        title,
        summary,
        content_json,
        markdown,
        item_ids,
        brief_ids,
        source_citations,
        period_start,
        period_end,
        created_at
      FROM reports;

      DROP TABLE reports;
      ALTER TABLE reports_migrated RENAME TO reports;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  if (
    hasColumn(database, "recommendation_bundles", "task_id") &&
    !hasColumn(database, "recommendation_bundles", "topic_id")
  ) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE recommendation_bundles_migrated (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        bundle_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      INSERT INTO recommendation_bundles_migrated (
        id,
        topic_id,
        position,
        bundle_json,
        created_at,
        updated_at
      )
      SELECT
        id,
        task_id,
        position,
        bundle_json,
        created_at,
        updated_at
      FROM recommendation_bundles;

      DROP TABLE recommendation_bundles;
      ALTER TABLE recommendation_bundles_migrated RENAME TO recommendation_bundles;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  if (hasColumn(database, "chat_threads", "scope_type")) {
    database
      .prepare("UPDATE chat_threads SET scope_type = 'topic' WHERE scope_type = 'task'")
      .run();
  }
}

function migrateTopicsTable(database: DatabaseSync) {
  const topicsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'topics'",
    )
    .get() as { sql: string } | undefined;

  if (!topicsTable) {
    return;
  }

  if (!topicsTable.sql.includes("owner_id")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE topics_migrated (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL DEFAULT 'local-user',
        title TEXT NOT NULL,
        topic_type TEXT NOT NULL CHECK(topic_type IN ('TOPIC', 'QUESTION')),
        user_prompt TEXT NOT NULL,
        relevance_level INTEGER NOT NULL DEFAULT 3,
        summary_preference TEXT NOT NULL DEFAULT 'balanced',
        topic_profile TEXT,
        schedule_profile TEXT,
        delivery_channels TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO topics_migrated (
        id,
        owner_id,
        title,
        topic_type,
        user_prompt,
        relevance_level,
        summary_preference,
        topic_profile,
        schedule_profile,
        delivery_channels,
        created_at,
        updated_at
      )
      SELECT
        id,
        'local-user',
        title,
        topic_type,
        user_prompt,
        relevance_level,
        summary_preference,
        CASE WHEN instr(sql, 'topic_profile') > 0 THEN topic_profile ELSE NULL END,
        CASE WHEN instr(sql, 'schedule_profile') > 0 THEN schedule_profile ELSE NULL END,
        CASE WHEN instr(sql, 'delivery_channels') > 0 THEN delivery_channels ELSE NULL END,
        created_at,
        updated_at
      FROM topics
      CROSS JOIN (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'topics');

      DROP TABLE topics;
      ALTER TABLE topics_migrated RENAME TO topics;

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    return;
  }

  if (!topicsTable.sql.includes("topic_profile")) {
    database.exec("ALTER TABLE topics ADD COLUMN topic_profile TEXT;");
  }

  if (!topicsTable.sql.includes("schedule_profile")) {
    database.exec("ALTER TABLE topics ADD COLUMN schedule_profile TEXT;");
  }

  if (!topicsTable.sql.includes("delivery_channels")) {
    database.exec("ALTER TABLE topics ADD COLUMN delivery_channels TEXT;");
  }
}

function migrateItemsTable(database: DatabaseSync) {
  const itemsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'",
    )
    .get() as { sql: string } | undefined;

  if (!itemsTable) {
    return;
  }

  if (itemsTable.sql.includes("content_hash")) {
    const qualityColumns: Array<[string, string]> = [
      ["is_real", "INTEGER"],
      ["relevance_score", "REAL"],
      ["relevance_reason", "TEXT"],
      ["keyword_mentioned", "INTEGER"],
      ["matched_terms", "TEXT"],
      ["quality_status", "TEXT NOT NULL DEFAULT 'pending'"],
      ["quality_error", "TEXT"],
      ["view_count", "INTEGER"],
      ["like_count", "INTEGER"],
      ["comment_count", "INTEGER"],
      ["share_count", "INTEGER"],
      ["reply_count", "INTEGER"],
      ["repost_count", "INTEGER"],
      ["source_native_score", "REAL"],
      ["author_name", "TEXT"],
      ["author_username", "TEXT"],
      ["author_followers", "INTEGER"],
      ["author_verified", "INTEGER"],
    ];

    for (const [column, definition] of qualityColumns) {
      if (!itemsTable.sql.includes(column)) {
        database.exec(`ALTER TABLE items ADD COLUMN ${column} ${definition};`);
      }
    }
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE items_migrated (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      summary TEXT,
      raw_content TEXT,
      origin TEXT,
      language TEXT,
      content_hash TEXT NOT NULL,
      structured_fields TEXT,
      is_real INTEGER,
      relevance_score REAL,
      relevance_reason TEXT,
      keyword_mentioned INTEGER,
      matched_terms TEXT,
      quality_status TEXT NOT NULL DEFAULT 'pending',
      quality_error TEXT,
      view_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      share_count INTEGER,
      reply_count INTEGER,
      repost_count INTEGER,
      source_native_score REAL,
      author_name TEXT,
      author_username TEXT,
      author_followers INTEGER,
      author_verified INTEGER,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    INSERT INTO items_migrated (
      id,
      source_id,
      title,
      canonical_url,
      summary,
      raw_content,
      origin,
      language,
      content_hash,
      structured_fields,
      is_real,
      relevance_score,
      relevance_reason,
      keyword_mentioned,
      matched_terms,
      quality_status,
      quality_error,
      view_count,
      like_count,
      comment_count,
      share_count,
      reply_count,
      repost_count,
      source_native_score,
      author_name,
      author_username,
      author_followers,
      author_verified,
      published_at,
      fetched_at,
      created_at
    )
    SELECT
      id,
      source_id,
      title,
      canonical_url,
      summary,
      summary,
      NULL,
      NULL,
      canonical_url || char(10) || title || char(10) || coalesce(summary, ''),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'pending',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      published_at,
      created_at,
      created_at
    FROM items;

    DROP TABLE items;
    ALTER TABLE items_migrated RENAME TO items;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateChatMessagesTable(database: DatabaseSync) {
  const chatMessagesTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'",
    )
    .get() as { sql: string } | undefined;

  if (!chatMessagesTable || chatMessagesTable.sql.includes("provenance")) {
    return;
  }

  database.exec(
    "ALTER TABLE chat_messages ADD COLUMN provenance TEXT CHECK(provenance IN ('stored', 'mixed'));",
  );
}

function createPrismaStore(databaseUrl?: string): PrismaStore {
  if (!databaseUrl) {
    return {
      runtime: "prisma",
      database: createUnavailableDatabaseHandle(),
      prisma: createUnavailablePrismaHandle(),
    };
  }

  const prismaClient =
    databaseUrl === process.env.DATABASE_URL
      ? getPrisma()
      : new PrismaClient({
          datasourceUrl: databaseUrl,
        });

  return {
    runtime: "prisma",
    database: createUnavailableDatabaseHandle(),
    prisma: prismaClient,
  };
}

const DEFAULT_SQLITE_PATH = join(process.cwd(), "data", "inflowee.sqlite");

export function createStore(): Store;
export function createStore(filename: string): SqliteStore;
export function createStore(options: { databaseUrl: string }): PrismaStore;
export function createStore(
  filenameOrOptions?:
    | string
    | {
        databaseUrl: string;
      },
): Store {
  if (filenameOrOptions === undefined) {
    const databaseUrl = getDatabaseUrl();

    if (databaseUrl) {
      return createPrismaStore(databaseUrl);
    }

    return createStore(process.env.INFLOWEE_SQLITE_PATH ?? DEFAULT_SQLITE_PATH);
  }

  if (
    typeof filenameOrOptions === "object" &&
    filenameOrOptions !== null &&
    "databaseUrl" in filenameOrOptions
  ) {
    return createPrismaStore(filenameOrOptions.databaseUrl);
  }

  const filename = filenameOrOptions;
  let database: DatabaseSync | undefined;

  const initializeDatabase = () => {
    mkdirSync(dirname(filename), { recursive: true });

    const nextDatabase = new DatabaseSync(filename);

    nextDatabase.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL DEFAULT 'local-user',
        title TEXT NOT NULL,
        topic_type TEXT NOT NULL CHECK(topic_type IN ('TOPIC', 'QUESTION')),
        user_prompt TEXT NOT NULL,
        relevance_level INTEGER NOT NULL DEFAULT 3,
        summary_preference TEXT NOT NULL DEFAULT 'balanced',
        topic_profile TEXT,
        schedule_profile TEXT,
        delivery_channels TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ${sourceTableDefinition}

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        summary TEXT,
        raw_content TEXT,
        origin TEXT,
        language TEXT,
        content_hash TEXT NOT NULL,
        structured_fields TEXT,
        is_real INTEGER,
        relevance_score REAL,
        relevance_reason TEXT,
        keyword_mentioned INTEGER,
        matched_terms TEXT,
        quality_status TEXT NOT NULL DEFAULT 'pending',
        quality_error TEXT,
        view_count INTEGER,
        like_count INTEGER,
        comment_count INTEGER,
        share_count INTEGER,
        reply_count INTEGER,
        repost_count INTEGER,
        source_native_score REAL,
        author_name TEXT,
        author_username TEXT,
        author_followers INTEGER,
        author_verified INTEGER,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS briefs (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_it_matters TEXT NOT NULL,
        source_citations TEXT NOT NULL,
        relevance_score REAL NOT NULL DEFAULT 0,
        importance_score REAL NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS brief_reads (
        brief_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (brief_id, actor_id),
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('current', 'daily', 'incremental')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content_json TEXT NOT NULL,
        markdown TEXT NOT NULL,
        item_ids TEXT NOT NULL DEFAULT '[]',
        brief_ids TEXT NOT NULL DEFAULT '[]',
        source_citations TEXT NOT NULL DEFAULT '[]',
        period_start TEXT,
        period_end TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS brief_items (
        brief_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        PRIMARY KEY (brief_id, item_id),
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('global', 'topic', 'brief')),
        scope_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        citations TEXT,
        provenance TEXT CHECK(provenance IN ('stored', 'mixed')),
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS recommendation_bundles (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        bundle_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        inserted_item_count INTEGER NOT NULL DEFAULT 0,
        created_brief_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS delivery_logs (
        id TEXT PRIMARY KEY,
        brief_id TEXT,
        content_type TEXT NOT NULL DEFAULT 'brief',
        content_id TEXT,
        endpoint TEXT NOT NULL,
        payload_type TEXT NOT NULL CHECK(payload_type IN ('html', 'slack', 'telegram', 'feishu', 'ntfy', 'dingtalk', 'wecom', 'bark', 'email')),
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        attempt_count INTEGER,
        response_status INTEGER,
        error TEXT,
        html_publication_id TEXT,
        html_url TEXT,
        html_status TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS html_push_configs (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 0,
        entitlement_status TEXT NOT NULL DEFAULT 'available',
        style_preset TEXT NOT NULL DEFAULT 'minimal_news',
        module_preset TEXT NOT NULL DEFAULT 'standard_summary',
        enabled_modules_json TEXT NOT NULL,
        custom_prompt TEXT,
        publish_target TEXT NOT NULL DEFAULT 'github',
        github_token_encrypted TEXT,
        github_repo TEXT,
        github_branch TEXT NOT NULL DEFAULT 'main',
        github_base_path TEXT NOT NULL DEFAULT 'inflowee/html',
        public_base_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS topic_html_push_configs (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL UNIQUE,
        use_global INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 0,
        style_preset TEXT NOT NULL DEFAULT 'minimal_news',
        module_preset TEXT NOT NULL DEFAULT 'standard_summary',
        enabled_modules_json TEXT NOT NULL,
        custom_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS html_publications (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        brief_id TEXT,
        report_id TEXT,
        content_type TEXT NOT NULL CHECK(content_type IN ('brief', 'report')),
        content_id TEXT NOT NULL,
        delivery_log_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'generated', 'published', 'failed')),
        title TEXT,
        html TEXT,
        html_url TEXT,
        publish_target TEXT NOT NULL DEFAULT 'github',
        publish_path TEXT,
        commit_sha TEXT,
        error TEXT,
        style_config_json TEXT NOT NULL,
        module_config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE,
        FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
        UNIQUE(content_type, content_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);
      CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_brief_reads_actor_read_at ON brief_reads(actor_id, read_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at ON sync_runs(source_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at ON delivery_logs(brief_id, started_at DESC);
    `);

    migrateLegacyTopicSchema(nextDatabase);
    migrateSourcesTable(nextDatabase);
    migrateBriefsTable(nextDatabase);
    migrateBriefReadsTable(nextDatabase);
    migrateTopicsTable(nextDatabase);
    migrateItemsTable(nextDatabase);
    migrateChatMessagesTable(nextDatabase);
    migrateSyncRunsTable(nextDatabase);
    migrateDeliveryLogsTable(nextDatabase);
    migrateHtmlPushTables(nextDatabase);
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_topics_owner_created_at ON topics(owner_id, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_topic_id ON sources(topic_id);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_next_sync_at ON sources(next_sync_at);");
    nextDatabase.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_briefs_topic_created_at ON briefs(topic_id, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_reports_topic_created_at ON reports(topic_id, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_brief_reads_actor_read_at ON brief_reads(actor_id, read_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_recommendation_bundles_topic_position ON recommendation_bundles(topic_id, position);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at ON sync_runs(source_id, started_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at ON delivery_logs(brief_id, started_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_delivery_logs_content_started_at ON delivery_logs(content_type, content_id, started_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_html_publications_owner_created_at ON html_publications(owner_id, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_html_publications_topic_created_at ON html_publications(topic_id, created_at DESC);");

    database = nextDatabase;
    return nextDatabase;
  };

  return {
    runtime: "sqlite",
    get database() {
      return database ?? initializeDatabase();
    },
  };
}

export const defaultStore = createStore();

export function getDefaultRuntimeStore(): Store {
  return createStore({ databaseUrl: requireDatabaseUrl() });
}

function mapTopic(row: TopicRow): TopicRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    topicType: row.topic_type,
    userPrompt: row.user_prompt,
    relevanceLevel: row.relevance_level,
    summaryPreference: row.summary_preference,
    topicProfile: row.topic_profile ? JSON.parse(row.topic_profile) : null,
    scheduleProfile: row.schedule_profile
      ? (JSON.parse(row.schedule_profile) as TopicScheduleProfile)
      : null,
    deliveryChannels: row.delivery_channels
      ? (JSON.parse(row.delivery_channels) as string[])
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPrismaTopic(topic: {
  id: string;
  ownerId: string;
  title: string;
  topicType: string;
  userPrompt: string;
  relevanceLevel: number;
  summaryPreference: string;
  topicProfile: unknown;
  scheduleProfile: unknown;
  deliveryChannels: unknown;
  createdAt: Date;
  updatedAt: Date;
}): TopicRecord {
  return {
    id: topic.id,
    ownerId: topic.ownerId,
    title: topic.title,
    topicType: topic.topicType as TopicType,
    userPrompt: topic.userPrompt,
    relevanceLevel: topic.relevanceLevel,
    summaryPreference: topic.summaryPreference,
    topicProfile: (topic.topicProfile as TopicProfile | null) ?? null,
    scheduleProfile:
      (topic.scheduleProfile as TopicScheduleProfile | null) ?? null,
    deliveryChannels: (topic.deliveryChannels as string[] | null) ?? null,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
}

function mapPrismaSource(source: {
  id: string;
  topicId: string;
  sourceType: string;
  title: string;
  url: string;
  configJson: unknown;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  syncIntervalMinutes: number;
  nextSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SourceRecord {
  return {
    id: source.id,
    topicId: source.topicId,
    sourceType: source.sourceType as SourceType,
    title: source.title,
    url: source.url,
    configJson: (source.configJson as Record<string, unknown> | null) ?? null,
    status: source.status as SourceStatus,
    lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
    lastError: source.lastError,
    syncIntervalMinutes: source.syncIntervalMinutes,
    nextSyncAt: source.nextSyncAt?.toISOString() ?? null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function mapPrismaItem(item: {
  id: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent: string | null;
  origin: string | null;
  language: string | null;
  contentHash: string;
  structuredFields: unknown;
  isReal: boolean | null;
  relevanceScore: number | null;
  relevanceReason: string | null;
  keywordMentioned: boolean | null;
  matchedTerms: unknown;
  qualityStatus: string;
  qualityError: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  replyCount: number | null;
  repostCount: number | null;
  sourceNativeScore: number | null;
  authorName: string | null;
  authorUsername: string | null;
  authorFollowers: number | null;
  authorVerified: boolean | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  createdAt: Date;
}): ItemRecord {
  return {
    id: item.id,
    sourceId: item.sourceId,
    title: item.title,
    canonicalUrl: item.canonicalUrl,
    summary: item.summary,
    rawContent: item.rawContent,
    origin: item.origin,
    language: item.language,
    contentHash: item.contentHash,
    structuredFields: (item.structuredFields as Record<string, unknown> | null) ?? null,
    isReal: item.isReal,
    relevanceScore: item.relevanceScore,
    relevanceReason: item.relevanceReason,
    keywordMentioned: item.keywordMentioned,
    matchedTerms: (item.matchedTerms as string[] | null) ?? null,
    qualityStatus: item.qualityStatus as ItemRecord["qualityStatus"],
    qualityError: item.qualityError,
    viewCount: item.viewCount,
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    shareCount: item.shareCount,
    replyCount: item.replyCount,
    repostCount: item.repostCount,
    sourceNativeScore: item.sourceNativeScore,
    authorName: item.authorName,
    authorUsername: item.authorUsername,
    authorFollowers: item.authorFollowers,
    authorVerified: item.authorVerified,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    fetchedAt: item.fetchedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function mapPrismaBrief(brief: {
  id: string;
  topicId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: unknown;
  relevanceScore: number;
  importanceScore: number;
  tagsJson: unknown;
  isRead: boolean;
  createdAt: Date;
  briefReads?: Array<{ actorId: string }>;
  topic?: { title: string } | null;
}): BriefRecord {
  return {
    id: brief.id,
    topicId: brief.topicId,
    title: brief.title,
    summary: brief.summary,
    whyItMatters: brief.whyItMatters,
    sourceCitations: (brief.sourceCitations as string[]) ?? [],
    relevanceScore: brief.relevanceScore,
    importanceScore: brief.importanceScore,
    tags: (brief.tagsJson as string[]) ?? [],
    isRead: brief.briefReads ? brief.briefReads.length > 0 : brief.isRead,
    createdAt: brief.createdAt.toISOString(),
    topicTitle: brief.topic?.title,
  };
}

function mapPrismaReport(report: {
  id: string;
  topicId: string;
  mode: string;
  title: string;
  summary: string;
  contentJson: unknown;
  markdown: string;
  itemIds: unknown;
  briefIds: unknown;
  sourceCitations: unknown;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
  topic?: { title: string } | null;
}): ReportRecord {
  return {
    id: report.id,
    topicId: report.topicId,
    mode: report.mode as ReportMode,
    title: report.title,
    summary: report.summary,
    content: (report.contentJson as Record<string, unknown>) ?? {},
    markdown: report.markdown,
    itemIds: (report.itemIds as string[]) ?? [],
    briefIds: (report.briefIds as string[]) ?? [],
    sourceCitations: (report.sourceCitations as string[]) ?? [],
    periodStart: report.periodStart?.toISOString() ?? null,
    periodEnd: report.periodEnd?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    topicTitle: report.topic?.title,
  };
}

function mapPrismaHtmlPushConfig(config: {
  id: string;
  ownerId: string;
  enabled: boolean;
  entitlementStatus: string;
  stylePreset: string;
  modulePreset: string;
  enabledModulesJson: unknown;
  customPrompt: string | null;
  publishTarget: string;
  githubTokenEncrypted: string | null;
  githubRepo: string | null;
  githubBranch: string;
  githubBasePath: string;
  publicBaseUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): HtmlPushConfigRecord {
  return {
    id: config.id,
    ownerId: config.ownerId,
    enabled: config.enabled,
    entitlementStatus:
      config.entitlementStatus as HtmlPushEntitlementStatus,
    stylePreset: config.stylePreset as HtmlPushStylePreset,
    modulePreset: config.modulePreset as HtmlPushModulePreset,
    enabledModules: (config.enabledModulesJson as HtmlPushModule[]) ?? [],
    customPrompt: config.customPrompt,
    publishTarget: config.publishTarget as "github",
    githubTokenEncrypted: config.githubTokenEncrypted,
    githubRepo: config.githubRepo,
    githubBranch: config.githubBranch,
    githubBasePath: config.githubBasePath,
    publicBaseUrl: config.publicBaseUrl,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

function mapPrismaTopicHtmlPushConfig(config: {
  id: string;
  topicId: string;
  useGlobal: boolean;
  enabled: boolean;
  stylePreset: string;
  modulePreset: string;
  enabledModulesJson: unknown;
  customPrompt: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TopicHtmlPushConfigRecord {
  return {
    id: config.id,
    topicId: config.topicId,
    useGlobal: config.useGlobal,
    enabled: config.enabled,
    stylePreset: config.stylePreset as HtmlPushStylePreset,
    modulePreset: config.modulePreset as HtmlPushModulePreset,
    enabledModules: (config.enabledModulesJson as HtmlPushModule[]) ?? [],
    customPrompt: config.customPrompt,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

function mapPrismaHtmlPublication(publication: {
  id: string;
  ownerId: string;
  topicId: string;
  briefId: string | null;
  reportId: string | null;
  contentType: string;
  contentId: string;
  deliveryLogId: string | null;
  status: string;
  title: string | null;
  html: string | null;
  htmlUrl: string | null;
  publishTarget: string;
  publishPath: string | null;
  commitSha: string | null;
  error: string | null;
  styleConfigJson: unknown;
  moduleConfigJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}): HtmlPublicationRecord {
  return {
    id: publication.id,
    ownerId: publication.ownerId,
    topicId: publication.topicId,
    briefId: publication.briefId,
    reportId: publication.reportId,
    contentType: publication.contentType as "brief" | "report",
    contentId: publication.contentId,
    deliveryLogId: publication.deliveryLogId,
    status: publication.status as HtmlPublicationStatus,
    title: publication.title,
    html: publication.html,
    htmlUrl: publication.htmlUrl,
    publishTarget: publication.publishTarget as "github",
    publishPath: publication.publishPath,
    commitSha: publication.commitSha,
    error: publication.error,
    styleConfig:
      (publication.styleConfigJson as Record<string, unknown> | null) ?? {},
    moduleConfig:
      (publication.moduleConfigJson as Record<string, unknown> | null) ?? {},
    createdAt: publication.createdAt.toISOString(),
    updatedAt: publication.updatedAt.toISOString(),
    publishedAt: publication.publishedAt?.toISOString() ?? null,
  };
}

function mapPrismaSyncRun(run: {
  id: string;
  sourceId: string;
  status: string;
  insertedItemCount: number;
  createdBriefCount: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): SyncRunRecord {
  return {
    id: run.id,
    sourceId: run.sourceId,
    status: run.status as SyncRunStatus,
    insertedItemCount: run.insertedItemCount,
    createdBriefCount: run.createdBriefCount,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

type PrismaDeliveryLogRow = {
  id: string;
  brief_id: string | null;
  content_type: string | null;
  content_id: string | null;
  endpoint: string;
  payload_type: DeliveryPayloadType;
  status: DeliveryStatus;
  attempt_count: number | null;
  response_status: number | null;
  error: string | null;
  html_publication_id: string | null;
  html_url: string | null;
  html_status: HtmlDeliveryStatus | null;
  started_at: Date;
  finished_at: Date | null;
};

function mapPrismaDeliveryLogRow(row: PrismaDeliveryLogRow): DeliveryLogRecord {
  return {
    id: row.id,
    briefId: row.brief_id,
    contentType: row.content_type ?? "brief",
    contentId: row.content_id ?? row.brief_id,
    endpoint: row.endpoint,
    payloadType: row.payload_type,
    status: row.status,
    attemptCount: row.attempt_count,
    responseStatus: row.response_status,
    error: row.error,
    htmlPublicationId: row.html_publication_id,
    htmlUrl: row.html_url,
    htmlStatus: row.html_status,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

export async function getHtmlPushConfig(
  store: Store,
  ownerId: string,
): Promise<HtmlPushConfigRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.htmlPushConfig.findUnique({
      where: { ownerId },
    });

    return row ? mapPrismaHtmlPushConfig(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM html_push_configs WHERE owner_id = ? LIMIT 1")
    .get(ownerId) as HtmlPushConfigRow | undefined;

  return row ? mapHtmlPushConfig(row) : null;
}

export async function saveHtmlPushConfig(
  store: Store,
  input: SaveHtmlPushConfigInput,
): Promise<HtmlPushConfigRecord> {
  const timestamp = new Date().toISOString();
  const enabledModulesJson = JSON.stringify(input.enabledModules);

  if (store.prisma) {
    const existing = await store.prisma.htmlPushConfig.findUnique({
      where: { ownerId: input.ownerId },
    });
    const data = {
      enabled: input.enabled,
      entitlementStatus: input.entitlementStatus ?? "available",
      stylePreset: input.stylePreset,
      modulePreset: input.modulePreset,
      enabledModulesJson: input.enabledModules as Prisma.InputJsonValue,
      customPrompt: input.customPrompt ?? null,
      publishTarget: input.publishTarget ?? "github",
      githubTokenEncrypted:
        input.githubTokenEncrypted === undefined
          ? (existing?.githubTokenEncrypted ?? null)
          : input.githubTokenEncrypted,
      githubRepo: input.githubRepo ?? null,
      githubBranch: input.githubBranch ?? "main",
      githubBasePath: input.githubBasePath ?? "inflowee/html",
      publicBaseUrl: input.publicBaseUrl ?? null,
    };
    const row = await store.prisma.htmlPushConfig.upsert({
      where: { ownerId: input.ownerId },
      create: {
        ownerId: input.ownerId,
        ...data,
      },
      update: data,
    });

    return mapPrismaHtmlPushConfig(row);
  }

  const existing = await getHtmlPushConfig(store, input.ownerId);
  const id = existing?.id ?? randomUUID();
  const githubTokenEncrypted =
    input.githubTokenEncrypted === undefined
      ? (existing?.githubTokenEncrypted ?? null)
      : input.githubTokenEncrypted;

  store.database
    .prepare(
      `INSERT INTO html_push_configs (
        id,
        owner_id,
        enabled,
        entitlement_status,
        style_preset,
        module_preset,
        enabled_modules_json,
        custom_prompt,
        publish_target,
        github_token_encrypted,
        github_repo,
        github_branch,
        github_base_path,
        public_base_url,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET
        enabled = excluded.enabled,
        entitlement_status = excluded.entitlement_status,
        style_preset = excluded.style_preset,
        module_preset = excluded.module_preset,
        enabled_modules_json = excluded.enabled_modules_json,
        custom_prompt = excluded.custom_prompt,
        publish_target = excluded.publish_target,
        github_token_encrypted = excluded.github_token_encrypted,
        github_repo = excluded.github_repo,
        github_branch = excluded.github_branch,
        github_base_path = excluded.github_base_path,
        public_base_url = excluded.public_base_url,
        updated_at = excluded.updated_at`,
    )
    .run(
      id,
      input.ownerId,
      Number(input.enabled),
      input.entitlementStatus ?? "available",
      input.stylePreset,
      input.modulePreset,
      enabledModulesJson,
      input.customPrompt ?? null,
      input.publishTarget ?? "github",
      githubTokenEncrypted,
      input.githubRepo ?? null,
      input.githubBranch ?? "main",
      input.githubBasePath ?? "inflowee/html",
      input.publicBaseUrl ?? null,
      existing?.createdAt ?? timestamp,
      timestamp,
    );

  const saved = await getHtmlPushConfig(store, input.ownerId);
  if (!saved) {
    throw new Error("Failed to save HTML push config.");
  }

  return saved;
}

export async function getTopicHtmlPushConfig(
  store: Store,
  topicId: string,
): Promise<TopicHtmlPushConfigRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.topicHtmlPushConfig.findUnique({
      where: { topicId },
    });

    return row ? mapPrismaTopicHtmlPushConfig(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM topic_html_push_configs WHERE topic_id = ? LIMIT 1")
    .get(topicId) as TopicHtmlPushConfigRow | undefined;

  return row ? mapTopicHtmlPushConfig(row) : null;
}

export async function saveTopicHtmlPushConfig(
  store: Store,
  input: SaveTopicHtmlPushConfigInput,
): Promise<TopicHtmlPushConfigRecord> {
  const timestamp = new Date().toISOString();
  const enabledModulesJson = JSON.stringify(input.enabledModules);

  if (store.prisma) {
    const row = await store.prisma.topicHtmlPushConfig.upsert({
      where: { topicId: input.topicId },
      create: {
        topicId: input.topicId,
        useGlobal: input.useGlobal,
        enabled: input.enabled,
        stylePreset: input.stylePreset,
        modulePreset: input.modulePreset,
        enabledModulesJson: input.enabledModules as Prisma.InputJsonValue,
        customPrompt: input.customPrompt ?? null,
      },
      update: {
        useGlobal: input.useGlobal,
        enabled: input.enabled,
        stylePreset: input.stylePreset,
        modulePreset: input.modulePreset,
        enabledModulesJson: input.enabledModules as Prisma.InputJsonValue,
        customPrompt: input.customPrompt ?? null,
      },
    });

    return mapPrismaTopicHtmlPushConfig(row);
  }

  const existing = await getTopicHtmlPushConfig(store, input.topicId);
  const id = existing?.id ?? randomUUID();

  store.database
    .prepare(
      `INSERT INTO topic_html_push_configs (
        id,
        topic_id,
        use_global,
        enabled,
        style_preset,
        module_preset,
        enabled_modules_json,
        custom_prompt,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id) DO UPDATE SET
        use_global = excluded.use_global,
        enabled = excluded.enabled,
        style_preset = excluded.style_preset,
        module_preset = excluded.module_preset,
        enabled_modules_json = excluded.enabled_modules_json,
        custom_prompt = excluded.custom_prompt,
        updated_at = excluded.updated_at`,
    )
    .run(
      id,
      input.topicId,
      Number(input.useGlobal),
      Number(input.enabled),
      input.stylePreset,
      input.modulePreset,
      enabledModulesJson,
      input.customPrompt ?? null,
      existing?.createdAt ?? timestamp,
      timestamp,
    );

  const saved = await getTopicHtmlPushConfig(store, input.topicId);
  if (!saved) {
    throw new Error("Failed to save topic HTML push config.");
  }

  return saved;
}

export async function createHtmlPublication(
  store: Store,
  input: CreateHtmlPublicationInput,
): Promise<string> {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const status = input.status ?? "pending";
  const styleConfig = input.styleConfig ?? {};
  const moduleConfig = input.moduleConfig ?? {};

  if (store.prisma) {
    const row = await store.prisma.htmlPublication.create({
      data: {
        id,
        ownerId: input.ownerId,
        topicId: input.topicId,
        briefId: input.briefId ?? null,
        reportId: input.reportId ?? null,
        contentType: input.contentType,
        contentId: input.contentId,
        deliveryLogId: input.deliveryLogId ?? null,
        status,
        title: input.title ?? null,
        html: input.html ?? null,
        htmlUrl: input.htmlUrl ?? null,
        publishTarget: input.publishTarget ?? "github",
        publishPath: input.publishPath ?? null,
        commitSha: input.commitSha ?? null,
        error: input.error ?? null,
        styleConfigJson: styleConfig as Prisma.InputJsonValue,
        moduleConfigJson: moduleConfig as Prisma.InputJsonValue,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      },
    });

    return row.id;
  }

  store.database
    .prepare(
      `INSERT INTO html_publications (
        id,
        owner_id,
        topic_id,
        brief_id,
        report_id,
        content_type,
        content_id,
        delivery_log_id,
        status,
        title,
        html,
        html_url,
        publish_target,
        publish_path,
        commit_sha,
        error,
        style_config_json,
        module_config_json,
        created_at,
        updated_at,
        published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.ownerId,
      input.topicId,
      input.briefId ?? null,
      input.reportId ?? null,
      input.contentType,
      input.contentId,
      input.deliveryLogId ?? null,
      status,
      input.title ?? null,
      input.html ?? null,
      input.htmlUrl ?? null,
      input.publishTarget ?? "github",
      input.publishPath ?? null,
      input.commitSha ?? null,
      input.error ?? null,
      JSON.stringify(styleConfig),
      JSON.stringify(moduleConfig),
      timestamp,
      timestamp,
      input.publishedAt ?? null,
    );

  return id;
}

export async function updateHtmlPublication(
  store: Store,
  id: string,
  input: UpdateHtmlPublicationInput,
): Promise<void> {
  const timestamp = new Date().toISOString();

  if (store.prisma) {
    await store.prisma.htmlPublication.update({
      where: { id },
      data: {
        ...(input.deliveryLogId !== undefined
          ? { deliveryLogId: input.deliveryLogId }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.html !== undefined ? { html: input.html } : {}),
        ...(input.htmlUrl !== undefined ? { htmlUrl: input.htmlUrl } : {}),
        ...(input.publishPath !== undefined
          ? { publishPath: input.publishPath }
          : {}),
        ...(input.commitSha !== undefined ? { commitSha: input.commitSha } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
        ...(input.styleConfig !== undefined
          ? { styleConfigJson: input.styleConfig as Prisma.InputJsonValue }
          : {}),
        ...(input.moduleConfig !== undefined
          ? { moduleConfigJson: input.moduleConfig as Prisma.InputJsonValue }
          : {}),
        ...(input.publishedAt !== undefined
          ? {
              publishedAt: input.publishedAt
                ? new Date(input.publishedAt)
                : null,
            }
          : {}),
      },
    });

    return;
  }

  const existing = store.database
    .prepare("SELECT * FROM html_publications WHERE id = ? LIMIT 1")
    .get(id) as HtmlPublicationRow | undefined;

  if (!existing) {
    throw new Error("HTML publication not found.");
  }

  store.database
    .prepare(
      `UPDATE html_publications
       SET delivery_log_id = ?,
           status = ?,
           title = ?,
           html = ?,
           html_url = ?,
           publish_path = ?,
           commit_sha = ?,
           error = ?,
           style_config_json = ?,
           module_config_json = ?,
           updated_at = ?,
           published_at = ?
       WHERE id = ?`,
    )
    .run(
      input.deliveryLogId !== undefined
        ? input.deliveryLogId
        : existing.delivery_log_id,
      input.status ?? existing.status,
      input.title !== undefined ? input.title : existing.title,
      input.html !== undefined ? input.html : existing.html,
      input.htmlUrl !== undefined ? input.htmlUrl : existing.html_url,
      input.publishPath !== undefined ? input.publishPath : existing.publish_path,
      input.commitSha !== undefined ? input.commitSha : existing.commit_sha,
      input.error !== undefined ? input.error : existing.error,
      input.styleConfig !== undefined
        ? JSON.stringify(input.styleConfig)
        : existing.style_config_json,
      input.moduleConfig !== undefined
        ? JSON.stringify(input.moduleConfig)
        : existing.module_config_json,
      timestamp,
      input.publishedAt !== undefined
        ? input.publishedAt
        : existing.published_at,
      id,
    );
}

export async function getHtmlPublicationByContent(
  store: Store,
  input: { contentType: "brief" | "report"; contentId: string },
): Promise<HtmlPublicationRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.htmlPublication.findUnique({
      where: {
        contentType_contentId: {
          contentType: input.contentType,
          contentId: input.contentId,
        },
      },
    });

    return row ? mapPrismaHtmlPublication(row) : null;
  }

  const row = store.database
    .prepare(
      `SELECT * FROM html_publications
       WHERE content_type = ?
         AND content_id = ?
       LIMIT 1`,
    )
    .get(input.contentType, input.contentId) as HtmlPublicationRow | undefined;

  return row ? mapHtmlPublication(row) : null;
}

export async function getHtmlPublicationById(
  store: Store,
  id: string,
): Promise<HtmlPublicationRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.htmlPublication.findUnique({
      where: { id },
    });

    return row ? mapPrismaHtmlPublication(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM html_publications WHERE id = ? LIMIT 1")
    .get(id) as HtmlPublicationRow | undefined;

  return row ? mapHtmlPublication(row) : null;
}

export async function listRecentHtmlPublications(
  store: Store,
  limit = 20,
  filters: { ownerId?: string; topicId?: string } = {},
): Promise<HtmlPublicationRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.htmlPublication.findMany({
      where: {
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...(filters.topicId ? { topicId: filters.topicId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rows.map(mapPrismaHtmlPublication);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM html_publications
       WHERE (? IS NULL OR owner_id = ?)
         AND (? IS NULL OR topic_id = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(
      filters.ownerId ?? null,
      filters.ownerId ?? null,
      filters.topicId ?? null,
      filters.topicId ?? null,
      limit,
    ) as HtmlPublicationRow[];

  return rows.map(mapHtmlPublication);
}

export async function listTopics(
  store: Store = defaultStore,
  filters: { ownerId?: string; actorId?: string } = {},
): Promise<TopicRecord[]> {
  const ownerId = filters.actorId ?? filters.ownerId;

  if (store.prisma) {
    const rows = await store.prisma.topic.findMany({
      where: ownerId ? { ownerId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaTopic);
  }

  const rows = store.database
    .prepare(
      ownerId
        ? "SELECT * FROM topics WHERE owner_id = ? ORDER BY created_at DESC"
        : "SELECT * FROM topics ORDER BY created_at DESC",
    )
    .all(...(ownerId ? [ownerId] : [])) as TopicRow[];

  return rows.map(mapTopic);
}

export async function hasTopicOwner(
  store: Store,
  actorId: string,
  topicId: string,
): Promise<boolean> {
  const topic = await getTopicById(store, topicId);
  return topic?.ownerId === actorId;
}

export async function getTopicByBriefId(
  store: Store,
  briefId: string,
): Promise<TopicRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.brief.findUnique({
      where: { id: briefId },
      include: { topic: true },
    });

    return row ? mapPrismaTopic(row.topic) : null;
  }

  const row = store.database
    .prepare(
      `SELECT topics.*
       FROM topics
       JOIN briefs ON briefs.topic_id = topics.id
       WHERE briefs.id = ?
       LIMIT 1`,
    )
    .get(briefId) as TopicRow | undefined;

  return row ? mapTopic(row) : null;
}

export async function hasBriefOwner(
  store: Store,
  actorId: string,
  briefId: string,
): Promise<boolean> {
  const topic = await getTopicByBriefId(store, briefId);
  return topic?.ownerId === actorId;
}

export function createTopicRecord(input: CreateTopicInput): Promise<string>;
export function createTopicRecord(
  store: Store,
  input: CreateTopicInput,
): Promise<string>;
export async function createTopicRecord(
  storeOrInput: Store | CreateTopicInput,
  maybeInput?: CreateTopicInput,
) {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as CreateTopicInput);

  if (store.prisma) {
    const topic = await store.prisma.topic.create({
      data: {
        ownerId: input.ownerId ?? "local-user",
        title: input.title,
        topicType: input.topicType,
        userPrompt: input.userPrompt,
        relevanceLevel: 3,
        summaryPreference: "balanced",
        deliveryChannels: [],
      },
    });

    return topic.id;
  }

  const timestamp = new Date().toISOString();
  const id = randomUUID();

  store.database
    .prepare(
      `INSERT INTO topics (
        id,
        owner_id,
        title,
        topic_type,
        user_prompt,
        relevance_level,
        summary_preference,
        schedule_profile,
        delivery_channels,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.ownerId ?? "local-user",
      input.title,
      input.topicType,
      input.userPrompt,
      3,
      "balanced",
      null,
      JSON.stringify([]),
      timestamp,
      timestamp,
    );

  return id;
}

export async function hasTopicRecord(
  store: Store,
  topicId: string,
): Promise<boolean> {
  if (store.prisma) {
    const count = await store.prisma.topic.count({
      where: { id: topicId },
    });

    return count > 0;
  }

  return Boolean(
    store.database
      .prepare("SELECT 1 FROM topics WHERE id = ? LIMIT 1")
      .get(topicId),
  );
}

export async function getSourceById(
  store: Store,
  sourceId: string,
): Promise<SourceRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.source.findUnique({
      where: { id: sourceId },
    });

    return row ? mapPrismaSource(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM sources WHERE id = ? LIMIT 1")
    .get(sourceId) as SourceRow | undefined;

  return row ? mapSource(row) : null;
}

export async function getTopicBySourceId(
  store: Store,
  sourceId: string,
): Promise<TopicRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.source.findUnique({
      where: { id: sourceId },
      include: { topic: true },
    });

    return row ? mapPrismaTopic(row.topic) : null;
  }

  const row = store.database
    .prepare(
      `SELECT topics.*
       FROM topics
       JOIN sources ON sources.topic_id = topics.id
       WHERE sources.id = ?
       LIMIT 1`,
    )
    .get(sourceId) as TopicRow | undefined;

  return row ? mapTopic(row) : null;
}

export async function createSourceRecord(
  store: Store,
  input: {
    topicId: string;
    sourceType: SourceType;
    title: string;
    url: string;
    configJson?: Record<string, unknown> | null;
  },
) {
  if (store.prisma) {
    const source = await store.prisma.source.create({
      data: {
        topicId: input.topicId,
        sourceType: input.sourceType,
        title: input.title,
        url: input.url,
        configJson:
          (input.configJson as Prisma.InputJsonValue | undefined) ?? undefined,
        status: "idle",
        syncIntervalMinutes: 360,
        nextSyncAt: new Date(),
      },
    });

    return source.id;
  }

  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const nextSyncAt = timestamp;

  store.database
    .prepare(
      `INSERT INTO sources (
        id,
        topic_id,
        source_type,
        title,
        url,
        config_json,
        status,
        sync_interval_minutes,
        next_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.topicId,
      input.sourceType,
      input.title,
      input.url,
      input.configJson ? JSON.stringify(input.configJson) : null,
      "idle",
      360,
      nextSyncAt,
      timestamp,
      timestamp,
    );

  return id;
}

export async function createItemRecordResult(
  store: Store,
  input: {
    sourceId: string;
    title: string;
    canonicalUrl: string;
    summary?: string | null;
    rawContent?: string | null;
    origin?: string | null;
    language?: string | null;
    contentHash?: string;
    structuredFields?: Record<string, unknown> | null;
    isReal?: boolean | null;
    relevanceScore?: number | null;
    relevanceReason?: string | null;
    keywordMentioned?: boolean | null;
    matchedTerms?: string[] | null;
    qualityStatus?: ItemRecord["qualityStatus"];
    qualityError?: string | null;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
    shareCount?: number | null;
    replyCount?: number | null;
    repostCount?: number | null;
    sourceNativeScore?: number | null;
    authorName?: string | null;
    authorUsername?: string | null;
    authorFollowers?: number | null;
    authorVerified?: boolean | null;
    publishedAt?: string | null;
    fetchedAt?: string;
  },
): Promise<ItemRecord | null> {
  if (store.prisma) {
    const timestamp = new Date();
    const rawContent = input.rawContent ?? input.summary ?? input.title;
    const contentHash =
      input.contentHash ??
      createHash("sha256")
        .update(`${input.canonicalUrl}\n${input.title}\n${rawContent ?? ""}`)
        .digest("hex");
    const fetchedAt = input.fetchedAt ? new Date(input.fetchedAt) : timestamp;

    try {
      const item = await store.prisma.item.create({
        data: {
          sourceId: input.sourceId,
          title: input.title,
          canonicalUrl: input.canonicalUrl,
          summary: input.summary ?? null,
          rawContent,
          origin: input.origin ?? new URL(input.canonicalUrl).hostname,
          language: input.language ?? null,
          contentHash,
          structuredFields:
            (input.structuredFields as Prisma.InputJsonValue | undefined) ??
            undefined,
          isReal: input.isReal ?? null,
          relevanceScore: input.relevanceScore ?? null,
          relevanceReason: input.relevanceReason ?? null,
          keywordMentioned: input.keywordMentioned ?? null,
          matchedTerms:
            (input.matchedTerms as Prisma.InputJsonValue | undefined) ??
            undefined,
          qualityStatus: input.qualityStatus ?? "pending",
          qualityError: input.qualityError ?? null,
          viewCount: input.viewCount ?? null,
          likeCount: input.likeCount ?? null,
          commentCount: input.commentCount ?? null,
          shareCount: input.shareCount ?? null,
          replyCount: input.replyCount ?? null,
          repostCount: input.repostCount ?? null,
          sourceNativeScore: input.sourceNativeScore ?? null,
          authorName: input.authorName ?? null,
          authorUsername: input.authorUsername ?? null,
          authorFollowers: input.authorFollowers ?? null,
          authorVerified: input.authorVerified ?? null,
          publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          fetchedAt,
        },
      });

      return mapPrismaItem(item);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return null;
      }

      throw error;
    }
  }

  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const rawContent = input.rawContent ?? input.summary ?? input.title;
  const contentHash =
    input.contentHash ??
    createHash("sha256")
      .update(`${input.canonicalUrl}\n${input.title}\n${rawContent ?? ""}`)
      .digest("hex");
  const fetchedAt = input.fetchedAt ?? timestamp;
  const result = store.database
    .prepare(
      `INSERT OR IGNORE INTO items (
        id,
        source_id,
        title,
        canonical_url,
        summary,
        raw_content,
        origin,
        language,
        content_hash,
        structured_fields,
        is_real,
        relevance_score,
        relevance_reason,
        keyword_mentioned,
        matched_terms,
        quality_status,
        quality_error,
        view_count,
        like_count,
        comment_count,
        share_count,
        reply_count,
        repost_count,
        source_native_score,
        author_name,
        author_username,
        author_followers,
        author_verified,
        published_at,
        fetched_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.sourceId,
      input.title,
      input.canonicalUrl,
      input.summary ?? null,
      rawContent,
      input.origin ?? new URL(input.canonicalUrl).hostname,
      input.language ?? null,
      contentHash,
      input.structuredFields ? JSON.stringify(input.structuredFields) : null,
      input.isReal === undefined || input.isReal === null
        ? null
        : Number(input.isReal),
      input.relevanceScore ?? null,
      input.relevanceReason ?? null,
      input.keywordMentioned === undefined || input.keywordMentioned === null
        ? null
        : Number(input.keywordMentioned),
      input.matchedTerms ? JSON.stringify(input.matchedTerms) : null,
      input.qualityStatus ?? "pending",
      input.qualityError ?? null,
      input.viewCount ?? null,
      input.likeCount ?? null,
      input.commentCount ?? null,
      input.shareCount ?? null,
      input.replyCount ?? null,
      input.repostCount ?? null,
      input.sourceNativeScore ?? null,
      input.authorName ?? null,
      input.authorUsername ?? null,
      input.authorFollowers ?? null,
      input.authorVerified === undefined || input.authorVerified === null
        ? null
        : Number(input.authorVerified),
      input.publishedAt ?? null,
      fetchedAt,
      timestamp,
    );

  if (Number(result.changes) === 0) {
    return null;
  }

  return {
    id,
    sourceId: input.sourceId,
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    summary: input.summary ?? null,
    rawContent,
    origin: input.origin ?? new URL(input.canonicalUrl).hostname,
    language: input.language ?? null,
    contentHash,
    structuredFields: input.structuredFields ?? null,
    isReal: input.isReal ?? null,
    relevanceScore: input.relevanceScore ?? null,
    relevanceReason: input.relevanceReason ?? null,
    keywordMentioned: input.keywordMentioned ?? null,
    matchedTerms: input.matchedTerms ?? null,
    qualityStatus: input.qualityStatus ?? "pending",
    qualityError: input.qualityError ?? null,
    viewCount: input.viewCount ?? null,
    likeCount: input.likeCount ?? null,
    commentCount: input.commentCount ?? null,
    shareCount: input.shareCount ?? null,
    replyCount: input.replyCount ?? null,
    repostCount: input.repostCount ?? null,
    sourceNativeScore: input.sourceNativeScore ?? null,
    authorName: input.authorName ?? null,
    authorUsername: input.authorUsername ?? null,
    authorFollowers: input.authorFollowers ?? null,
    authorVerified: input.authorVerified ?? null,
    publishedAt: input.publishedAt ?? null,
    fetchedAt,
    createdAt: timestamp,
  };
}

export async function createItemRecord(
  store: Store,
  input: {
    sourceId: string;
    title: string;
    canonicalUrl: string;
    summary?: string | null;
    rawContent?: string | null;
    origin?: string | null;
    language?: string | null;
    contentHash?: string;
    structuredFields?: Record<string, unknown> | null;
    isReal?: boolean | null;
    relevanceScore?: number | null;
    relevanceReason?: string | null;
    keywordMentioned?: boolean | null;
    matchedTerms?: string[] | null;
    qualityStatus?: ItemRecord["qualityStatus"];
    qualityError?: string | null;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
    shareCount?: number | null;
    replyCount?: number | null;
    repostCount?: number | null;
    sourceNativeScore?: number | null;
    authorName?: string | null;
    authorUsername?: string | null;
    authorFollowers?: number | null;
    authorVerified?: boolean | null;
    publishedAt?: string | null;
    fetchedAt?: string;
  },
): Promise<boolean> {
  return (await createItemRecordResult(store, input)) !== null;
}

export async function listSourcesByTopic(
  store: Store,
  topicId: string,
): Promise<SourceRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.source.findMany({
      where: { topicId },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaSource);
  }

  const rows = store.database
    .prepare(
      "SELECT * FROM sources WHERE topic_id = ? ORDER BY created_at DESC",
    )
    .all(topicId) as SourceRow[];

  return rows.map(mapSource);
}

export async function listDueSources(
  store: Store,
  nowIso = new Date().toISOString(),
): Promise<SourceRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.source.findMany({
      where: {
        status: {
          not: "error",
        },
        nextSyncAt: {
          not: null,
          lte: new Date(nowIso),
        },
      },
      orderBy: [{ nextSyncAt: "asc" }, { createdAt: "asc" }],
    });

    return rows.map(mapPrismaSource);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM sources
       WHERE status != 'error'
         AND next_sync_at IS NOT NULL
         AND next_sync_at <= ?
       ORDER BY next_sync_at ASC, created_at ASC`,
    )
    .all(nowIso) as SourceRow[];

  return rows.map(mapSource);
}

export async function listItemsBySource(
  store: Store,
  sourceId: string,
): Promise<ItemRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.item.findMany({
      where: { sourceId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });

    return rows.map(mapPrismaItem);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM items
       WHERE source_id = ?
       ORDER BY published_at DESC, created_at DESC`,
    )
    .all(sourceId) as ItemRow[];

  return rows.map(mapItem);
}

export async function listItemsByBriefId(
  store: Store,
  briefId: string,
): Promise<ItemRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.briefItem.findMany({
      where: { briefId },
      include: { item: true },
      orderBy: [{ item: { publishedAt: "desc" } }, { item: { createdAt: "desc" } }],
    });

    return rows.map((row) => mapPrismaItem(row.item));
  }

  const rows = store.database
    .prepare(
      `SELECT items.*
       FROM items
       JOIN brief_items ON brief_items.item_id = items.id
       WHERE brief_items.brief_id = ?
       ORDER BY items.published_at DESC, items.created_at DESC`,
    )
    .all(briefId) as ItemRow[];

  return rows.map(mapItem);
}

export async function createBriefRecord(
  store: Store,
  input: {
    topicId: string;
    itemIds: string[];
    title: string;
    summary: string;
    whyItMatters: string;
    sourceCitations: string[];
    relevanceScore?: number;
    importanceScore?: number;
    tags?: string[];
  },
): Promise<string> {
  if (store.prisma) {
    const created = await store.prisma.$transaction(async (tx) => {
      const brief = await tx.brief.create({
        data: {
          topicId: input.topicId,
          title: input.title,
          summary: input.summary,
          whyItMatters: input.whyItMatters,
          sourceCitations: input.sourceCitations,
          relevanceScore: input.relevanceScore ?? 0.5,
          importanceScore: input.importanceScore ?? 0.5,
          tagsJson: input.tags ?? [],
        },
      });

      if (input.itemIds.length > 0) {
        await tx.briefItem.createMany({
          data: input.itemIds.map((itemId) => ({
            briefId: brief.id,
            itemId,
          })),
          skipDuplicates: true,
        });
      }

      return brief.id;
    });

    return created;
  }

  const id = randomUUID();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO briefs (
        id,
        topic_id,
        title,
        summary,
        why_it_matters,
        source_citations,
        relevance_score,
        importance_score,
        tags_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.topicId,
      input.title,
      input.summary,
      input.whyItMatters,
      JSON.stringify(input.sourceCitations),
      input.relevanceScore ?? 0.5,
      input.importanceScore ?? 0.5,
      JSON.stringify(input.tags ?? []),
      timestamp,
    );

  const statement = store.database.prepare(
    `INSERT OR IGNORE INTO brief_items (brief_id, item_id) VALUES (?, ?)`,
  );

  for (const itemId of input.itemIds) {
    statement.run(id, itemId);
  }

  return id;
}

export async function listBriefs(
  store: Store = defaultStore,
): Promise<BriefRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.brief.findMany({
      orderBy: [
        { importanceScore: "desc" },
        { relevanceScore: "desc" },
        { createdAt: "desc" },
      ],
      include: { topic: true },
    });

    return rows.map(mapPrismaBrief);
  }

  const rows = store.database
    .prepare(
      `SELECT
         briefs.*,
         topics.title AS topic_title
       FROM briefs
       JOIN topics ON briefs.topic_id = topics.id
       ORDER BY briefs.importance_score DESC, briefs.relevance_score DESC, briefs.created_at DESC`,
    )
    .all() as BriefRow[];

  return rows.map(mapBrief);
}

export async function markSourceSyncResult(
  store: Store,
  input: {
    sourceId: string;
    status: SourceStatus;
    error?: string | null;
  },
) {
  if (store.prisma) {
    const timestamp = new Date();

    await store.prisma.source.update({
      where: { id: input.sourceId },
      data: {
        status: input.status,
        lastSyncedAt: timestamp,
        lastError:
          input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
        updatedAt: timestamp,
      },
    });

    return;
  }

  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `UPDATE sources
       SET status = ?,
           last_synced_at = ?,
           last_error = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      timestamp,
      input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
      timestamp,
      input.sourceId,
    );
}

export async function setSourceSchedule(
  store: Store,
  sourceId: string,
  syncIntervalMinutes: number,
  nextSyncAt?: string,
): Promise<void> {
  if (store.prisma) {
    const timestamp = new Date();
    await store.prisma.source.update({
      where: { id: sourceId },
      data: {
        syncIntervalMinutes,
        nextSyncAt: new Date(nextSyncAt ?? timestamp.toISOString()),
        updatedAt: timestamp,
      },
    });

    return;
  }

  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `UPDATE sources
       SET sync_interval_minutes = ?,
           next_sync_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(syncIntervalMinutes, nextSyncAt ?? timestamp, timestamp, sourceId);
}

export async function scheduleNextSourceSync(
  store: Store,
  sourceId: string,
  syncIntervalMinutes: number,
  baseTimeIso = new Date().toISOString(),
): Promise<string> {
  if (store.prisma) {
    const baseTime = Date.parse(baseTimeIso);
    const nextSyncAt = new Date(
      baseTime + syncIntervalMinutes * 60 * 1000,
    ).toISOString();
    const timestamp = new Date();

    await store.prisma.source.update({
      where: { id: sourceId },
      data: {
        nextSyncAt: new Date(nextSyncAt),
        updatedAt: timestamp,
      },
    });

    return nextSyncAt;
  }

  const baseTime = Date.parse(baseTimeIso);
  const nextSyncAt = new Date(
    baseTime + syncIntervalMinutes * 60 * 1000,
  ).toISOString();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `UPDATE sources
       SET next_sync_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(nextSyncAt, timestamp, sourceId);

  return nextSyncAt;
}

export async function createSyncRun(
  store: Store,
  input: { sourceId: string },
): Promise<string> {
  if (store.prisma) {
    const run = await store.prisma.syncRun.create({
      data: {
        sourceId: input.sourceId,
        status: "running",
        insertedItemCount: 0,
        createdBriefCount: 0,
        startedAt: new Date(),
      },
    });

    return run.id;
  }

  const id = randomUUID();
  const startedAt = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO sync_runs (
        id,
        source_id,
        status,
        started_at
      ) VALUES (?, ?, 'running', ?)`,
    )
    .run(id, input.sourceId, startedAt);

  return id;
}

export async function finishSyncRun(
  store: Store,
  input: {
    runId: string;
    status: "success" | "error";
    insertedItemCount?: number;
    createdBriefCount?: number;
    error?: string | null;
  },
) {
  if (store.prisma) {
    await store.prisma.syncRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        insertedItemCount: input.insertedItemCount ?? 0,
        createdBriefCount: input.createdBriefCount ?? 0,
        error:
          input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
        finishedAt: new Date(),
      },
    });

    return;
  }

  store.database
    .prepare(
      `UPDATE sync_runs
       SET status = ?,
           inserted_item_count = ?,
           created_brief_count = ?,
           error = ?,
           finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.insertedItemCount ?? 0,
      input.createdBriefCount ?? 0,
      input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
      new Date().toISOString(),
      input.runId,
    );
}

export async function listRecentSyncRunsBySource(
  store: Store,
  sourceId: string,
  limit = 5,
): Promise<SyncRunRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.syncRun.findMany({
      where: { sourceId },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return rows.map(mapPrismaSyncRun);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM sync_runs
       WHERE source_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(sourceId, limit) as SyncRunRow[];

  return rows.map(mapSyncRun);
}

async function saveAppSetting(store: Store, key: string, value: string) {
  if (store.prisma) {
    await store.prisma.appSetting.upsert({
      where: { key },
      update: {
        value,
        updatedAt: new Date(),
      },
      create: {
        key,
        value,
        updatedAt: new Date(),
      },
    });

    return;
  }

  const updatedAt = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(key, value, updatedAt);
}

async function getAppSetting(store: Store, key: string) {
  if (store.prisma) {
    const row = await store.prisma.appSetting.findUnique({
      where: { key },
    });

    return {
      value: row?.value ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  const row = store.database
    .prepare(
      `SELECT value, updated_at
       FROM app_settings
       WHERE key = ?
       LIMIT 1`,
    )
    .get(key) as AppSettingRow | undefined;

  return {
    value: row?.value ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveWebhookSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "webhook_endpoint", endpoint);
}

export async function getWebhookSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = await getAppSetting(store, "webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveSlackSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "slack_webhook_endpoint", endpoint);
}

export async function getSlackSettings(
  store: Store,
): Promise<SlackSettingsRecord> {
  const row = await getAppSetting(store, "slack_webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveTelegramSettings(
  store: Store,
  input: {
    botToken: string;
    chatId: string;
  },
) {
  await Promise.all([
    saveAppSetting(store, "telegram_bot_token", input.botToken),
    saveAppSetting(store, "telegram_chat_id", input.chatId),
  ]);
}

export async function getTelegramSettings(
  store: Store,
): Promise<TelegramSettingsRecord> {
  const [tokenRow, chatRow] = await Promise.all([
    getAppSetting(store, "telegram_bot_token"),
    getAppSetting(store, "telegram_chat_id"),
  ]);

  return {
    botToken: tokenRow.value,
    chatId: chatRow.value,
    updatedAt: chatRow.updatedAt ?? tokenRow.updatedAt,
  };
}

export type TelegramSourceSettingsRecord = {
  botToken: string | null;
  updatedAt: string | null;
};

export async function saveTelegramSourceSettings(
  store: Store,
  input: {
    botToken: string;
  },
) {
  await saveAppSetting(store, "telegram_source_bot_token", input.botToken);
}

export async function getTelegramSourceSettings(
  store: Store,
): Promise<TelegramSourceSettingsRecord> {
  const tokenRow = await getAppSetting(store, "telegram_source_bot_token");

  return {
    botToken: tokenRow.value,
    updatedAt: tokenRow.updatedAt,
  };
}

export async function saveFeishuSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "feishu_webhook_endpoint", endpoint);
}

export async function getFeishuSettings(
  store: Store,
): Promise<FeishuSettingsRecord> {
  const row = await getAppSetting(store, "feishu_webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveNtfySettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "ntfy_endpoint", endpoint);
}

export async function getNtfySettings(
  store: Store,
): Promise<NtfySettingsRecord> {
  const row = await getAppSetting(store, "ntfy_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveDingTalkSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "dingtalk_webhook_endpoint", endpoint);
}

export async function getDingTalkSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = await getAppSetting(store, "dingtalk_webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveWeComSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "wecom_webhook_endpoint", endpoint);
}

export async function getWeComSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = await getAppSetting(store, "wecom_webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveBarkSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "bark_endpoint", endpoint);
}

export async function getBarkSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = await getAppSetting(store, "bark_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveEmailSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "email_smtp_relay_endpoint", endpoint);
}

export async function getEmailSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = await getAppSetting(store, "email_smtp_relay_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveDefaultDeliveryChannels(
  store: Store,
  channels: string[],
) {
  await saveAppSetting(
    store,
    "default_delivery_channels",
    JSON.stringify([...new Set(channels)].filter(Boolean)),
  );
}

export async function getDefaultDeliveryChannels(
  store: Store,
): Promise<DefaultDeliveryChannelsRecord> {
  const row = await getAppSetting(store, "default_delivery_channels");

  if (!row.value) {
    return {
      channels: [],
      updatedAt: row.updatedAt,
    };
  }

  try {
    const channels = JSON.parse(row.value);

    return {
      channels: Array.isArray(channels)
        ? channels.filter((channel): channel is string => typeof channel === "string")
        : [],
      updatedAt: row.updatedAt,
    };
  } catch {
    return {
      channels: [],
      updatedAt: row.updatedAt,
    };
  }
}

export async function saveDeliveryTemplate(store: Store, template: string) {
  await saveAppSetting(store, "delivery_template", template.trim());
}

export async function getDeliveryTemplate(
  store: Store,
): Promise<DeliveryTemplateRecord> {
  const row = await getAppSetting(store, "delivery_template");

  return {
    template: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function hasProcessedDeliveryRequest(
  store: Store,
  requestKey: string,
): Promise<boolean> {
  const row = await getAppSetting(store, `delivery_request:${requestKey}`);
  return Boolean(row.value);
}

export async function markDeliveryRequestProcessed(
  store: Store,
  requestKey: string,
) {
  await saveAppSetting(
    store,
    `delivery_request:${requestKey}`,
    new Date().toISOString(),
  );
}

export async function createDeliveryLog(
  store: Store,
  input: {
    briefId?: string | null;
    contentType?: "brief" | "report" | "message";
    contentId?: string | null;
    endpoint: string;
    payloadType: DeliveryPayloadType;
    htmlPublicationId?: string | null;
    htmlUrl?: string | null;
    htmlStatus?: HtmlDeliveryStatus | null;
  },
) {
  const contentType = input.contentType ?? "brief";
  const contentId = input.contentId ?? input.briefId ?? null;

  if (store.prisma) {
    const log = await store.prisma.deliveryLog.create({
      data: {
        briefId: input.briefId ?? null,
        contentType,
        contentId,
        endpoint: input.endpoint,
        payloadType: input.payloadType,
        status: "running",
        htmlPublicationId: input.htmlPublicationId ?? null,
        htmlUrl: input.htmlUrl ?? null,
        htmlStatus: input.htmlStatus ?? null,
        startedAt: new Date(),
      },
    });

    return log.id;
  }

  const id = randomUUID();
  const startedAt = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO delivery_logs (
        id,
        brief_id,
        content_type,
        content_id,
        endpoint,
        payload_type,
        status,
        html_publication_id,
        html_url,
        html_status,
        started_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.briefId ?? null,
      contentType,
      contentId,
      input.endpoint,
      input.payloadType,
      input.htmlPublicationId ?? null,
      input.htmlUrl ?? null,
      input.htmlStatus ?? null,
      startedAt,
    );

  return id;
}

export async function finishDeliveryLog(
  store: Store,
  input: {
    logId: string;
    status: "success" | "error";
    attemptCount?: number | null;
    responseStatus?: number | null;
    error?: string | null;
    htmlPublicationId?: string | null;
    htmlUrl?: string | null;
    htmlStatus?: HtmlDeliveryStatus | null;
  },
) {
  if (store.prisma) {
    await store.prisma.$executeRaw(
      Prisma.sql`UPDATE "DeliveryLog"
                 SET "status" = ${input.status},
                     "attemptCount" = ${input.attemptCount ?? null},
                     "responseStatus" = ${input.responseStatus ?? null},
                     "error" = ${
                       input.status === "error"
                         ? (input.error ?? "Unknown delivery error.")
                         : null
                     },
                     "htmlPublicationId" = ${input.htmlPublicationId ?? null},
                     "htmlUrl" = ${input.htmlUrl ?? null},
                     "htmlStatus" = ${input.htmlStatus ?? null},
                     "finishedAt" = ${new Date()}
                 WHERE "id" = ${input.logId}`,
    );

    return;
  }

  store.database
    .prepare(
      `UPDATE delivery_logs
       SET status = ?,
           attempt_count = ?,
           response_status = ?,
           error = ?,
           html_publication_id = ?,
           html_url = ?,
           html_status = ?,
           finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.attemptCount ?? null,
      input.responseStatus ?? null,
      input.status === "error"
        ? (input.error ?? "Unknown delivery error.")
        : null,
      input.htmlPublicationId ?? null,
      input.htmlUrl ?? null,
      input.htmlStatus ?? null,
      new Date().toISOString(),
      input.logId,
    );
}

export async function listRecentDeliveryLogsByBrief(
  store: Store,
  briefId: string,
  limit = 10,
): Promise<DeliveryLogRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
      SELECT
        "id",
        "briefId" AS brief_id,
        "contentType" AS content_type,
        "contentId" AS content_id,
        "endpoint",
        "payloadType" AS payload_type,
        "status",
        "attemptCount" AS attempt_count,
        "responseStatus" AS response_status,
        "error",
        "htmlPublicationId" AS html_publication_id,
        "htmlUrl" AS html_url,
        "htmlStatus" AS html_status,
        "startedAt" AS started_at,
        "finishedAt" AS finished_at
      FROM "DeliveryLog"
      WHERE "briefId" = ${briefId}
      ORDER BY "startedAt" DESC
      LIMIT ${limit}
    `;

    return rows.map(mapPrismaDeliveryLogRow);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM delivery_logs
       WHERE brief_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(briefId, limit) as DeliveryLogRow[];

  return rows.map(mapDeliveryLog);
}

export async function listRecentDeliveryLogsByContent(
  store: Store,
  contentType: "brief" | "report" | "message",
  contentId: string,
  limit = 10,
): Promise<DeliveryLogRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
      SELECT
        "id",
        "briefId" AS brief_id,
        "contentType" AS content_type,
        "contentId" AS content_id,
        "endpoint",
        "payloadType" AS payload_type,
        "status",
        "attemptCount" AS attempt_count,
        "responseStatus" AS response_status,
        "error",
        "htmlPublicationId" AS html_publication_id,
        "htmlUrl" AS html_url,
        "htmlStatus" AS html_status,
        "startedAt" AS started_at,
        "finishedAt" AS finished_at
      FROM "DeliveryLog"
      WHERE "contentType" = ${contentType}
        AND "contentId" = ${contentId}
      ORDER BY "startedAt" DESC
      LIMIT ${limit}
    `;

    return rows.map(mapPrismaDeliveryLogRow);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM delivery_logs
       WHERE content_type = ?
         AND content_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(contentType, contentId, limit) as DeliveryLogRow[];

  return rows.map(mapDeliveryLog);
}

export async function listRecentDeliveryLogs(
  store: Store,
  limit = 20,
  filters: { actorId?: string } = {},
): Promise<DeliveryLogRecord[]> {
  if (store.prisma) {
    const rows = filters.actorId
      ? await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
          SELECT
            dl."id",
            dl."briefId" AS brief_id,
            dl."contentType" AS content_type,
            dl."contentId" AS content_id,
            dl."endpoint",
            dl."payloadType" AS payload_type,
            dl."status",
            dl."attemptCount" AS attempt_count,
            dl."responseStatus" AS response_status,
            dl."error",
            dl."htmlPublicationId" AS html_publication_id,
            dl."htmlUrl" AS html_url,
            dl."htmlStatus" AS html_status,
            dl."startedAt" AS started_at,
            dl."finishedAt" AS finished_at
          FROM "DeliveryLog" dl
          LEFT JOIN "Brief" b ON b."id" = dl."briefId"
          LEFT JOIN "Report" r ON r."id" = dl."contentId" AND dl."contentType" = 'report'
          JOIN "Topic" t ON t."id" = COALESCE(b."topicId", r."topicId")
          WHERE t."ownerId" = ${filters.actorId}
          ORDER BY dl."startedAt" DESC
          LIMIT ${limit}
        `
      : await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
          SELECT
            "id",
            "briefId" AS brief_id,
            "contentType" AS content_type,
            "contentId" AS content_id,
            "endpoint",
            "payloadType" AS payload_type,
            "status",
            "attemptCount" AS attempt_count,
            "responseStatus" AS response_status,
            "error",
            "htmlPublicationId" AS html_publication_id,
            "htmlUrl" AS html_url,
            "htmlStatus" AS html_status,
            "startedAt" AS started_at,
            "finishedAt" AS finished_at
          FROM "DeliveryLog"
          ORDER BY "startedAt" DESC
          LIMIT ${limit}
        `;

    return rows.map(mapPrismaDeliveryLogRow);
  }

  const rows = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT delivery_logs.*
             FROM delivery_logs
             LEFT JOIN briefs ON briefs.id = delivery_logs.brief_id
             LEFT JOIN reports ON reports.id = delivery_logs.content_id
               AND delivery_logs.content_type = 'report'
             JOIN topics ON topics.id = COALESCE(briefs.topic_id, reports.topic_id)
             WHERE topics.owner_id = ?
             ORDER BY delivery_logs.started_at DESC
             LIMIT ?`,
          )
          .all(filters.actorId, limit)
      : store.database
          .prepare(
            `SELECT * FROM delivery_logs
             ORDER BY started_at DESC
             LIMIT ?`,
          )
          .all(limit)
  ) as DeliveryLogRow[];

  return rows.map(mapDeliveryLog);
}

export async function listRecentSyncRuns(
  store: Store,
  limit = 20,
  filters: { actorId?: string } = {},
): Promise<SyncRunRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.syncRun.findMany({
      where: filters.actorId
        ? {
            source: {
              topic: {
                ownerId: filters.actorId,
              },
            },
          }
        : undefined,
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return rows.map(mapPrismaSyncRun);
  }

  const rows = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT sync_runs.*
             FROM sync_runs
             JOIN sources ON sources.id = sync_runs.source_id
             JOIN topics ON topics.id = sources.topic_id
             WHERE topics.owner_id = ?
             ORDER BY sync_runs.started_at DESC
             LIMIT ?`,
          )
          .all(filters.actorId, limit)
      : store.database
          .prepare(
            `SELECT * FROM sync_runs
             ORDER BY started_at DESC
             LIMIT ?`,
          )
          .all(limit)
  ) as SyncRunRow[];

  return rows.map(mapSyncRun);
}

export async function getSourceHealthSummary(
  store: Store,
  filters: { actorId?: string } = {},
): Promise<SourceHealthSummary> {
  const [sources, nowIso] = await Promise.all([
    listSources(store, filters),
    Promise.resolve(new Date().toISOString()),
  ]);

  return sources.reduce<SourceHealthSummary>(
    (summary, source) => {
      summary.total += 1;

      if (source.status === "success") {
        summary.healthy += 1;
      } else if (source.status === "error") {
        summary.errored += 1;
      } else {
        summary.idle += 1;
      }

      if (source.nextSyncAt && source.nextSyncAt <= nowIso) {
        summary.dueNow += 1;
      }

      return summary;
    },
    {
      total: 0,
      healthy: 0,
      errored: 0,
      idle: 0,
      dueNow: 0,
    },
  );
}

export async function getDeliveryHealthSummary(
  store: Store,
  filters: { actorId?: string } = {},
): Promise<DeliveryHealthSummary> {
  const [
    logs,
    webhookSettings,
    slackSettings,
    telegramSettings,
    feishuSettings,
    ntfySettings,
  ] = await Promise.all([
    listRecentDeliveryLogs(store, 50, filters),
    getWebhookSettings(store),
    getSlackSettings(store),
    getTelegramSettings(store),
    getFeishuSettings(store),
    getNtfySettings(store),
  ]);

  return logs.reduce<DeliveryHealthSummary>(
    (summary, log) => {
      summary.total += 1;
      summary[log.status] += 1;
      return summary;
    },
    {
      total: 0,
      success: 0,
      error: 0,
      running: 0,
      webhookConfigured: Boolean(webhookSettings.endpoint),
      slackConfigured: Boolean(slackSettings.endpoint),
      telegramConfigured: Boolean(
        telegramSettings.botToken && telegramSettings.chatId,
      ),
      feishuConfigured: Boolean(feishuSettings.endpoint),
      ntfyConfigured: Boolean(ntfySettings.endpoint),
    },
  );
}

export async function listSources(
  store: Store = defaultStore,
  filters: { actorId?: string } = {},
): Promise<SourceRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.source.findMany({
      where: filters.actorId
        ? {
            topic: {
              ownerId: filters.actorId,
            },
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaSource);
  }

  const rows = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT DISTINCT sources.*
             FROM sources
             JOIN topics ON topics.id = sources.topic_id
             WHERE topics.owner_id = ?
             ORDER BY sources.created_at DESC`,
          )
          .all(filters.actorId)
      : store.database
          .prepare("SELECT * FROM sources ORDER BY created_at DESC")
          .all()
  ) as SourceRow[];

  return rows.map(mapSource);
}

export async function getBriefById(
  store: Store,
  briefId: string,
  options: { actorId?: string } = {},
): Promise<BriefRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.brief.findUnique({
      where: { id: briefId },
      include: {
        ...(options.actorId
          ? {
              briefReads: {
                where: { actorId: options.actorId },
                select: { actorId: true },
              },
            }
          : {}),
        topic: true,
      },
    });

    return row ? mapPrismaBrief(row) : null;
  }

  const row = store.database
    .prepare(
      `SELECT
         briefs.id,
         briefs.topic_id,
         briefs.title,
         briefs.summary,
         briefs.why_it_matters,
         briefs.source_citations,
         briefs.relevance_score,
         briefs.importance_score,
         briefs.tags_json,
         ${
           options.actorId
             ? "CASE WHEN brief_reads.actor_id IS NULL THEN 0 ELSE 1 END"
             : "briefs.is_read"
         } AS is_read,
         briefs.created_at,
         topics.title AS topic_title
       FROM briefs
       JOIN topics ON briefs.topic_id = topics.id
       ${
         options.actorId
           ? "LEFT JOIN brief_reads ON brief_reads.brief_id = briefs.id AND brief_reads.actor_id = ?"
           : ""
       }
       WHERE briefs.id = ?
       LIMIT 1`,
    )
    .get(...(options.actorId ? [options.actorId, briefId] : [briefId])) as
    | BriefRow
    | undefined;

  return row ? mapBrief(row) : null;
}

export async function listBriefItemIds(
  store: Store,
  briefId: string,
): Promise<string[]> {
  if (store.prisma) {
    const rows = await store.prisma.briefItem.findMany({
      where: { briefId },
      select: { itemId: true },
    });

    return rows.map((row) => row.itemId);
  }

  const rows = store.database
    .prepare("SELECT item_id FROM brief_items WHERE brief_id = ?")
    .all(briefId) as Array<{ item_id: string }>;

  return rows.map((row) => row.item_id);
}

export async function briefExistsForItem(
  store: Store,
  itemId: string,
): Promise<boolean> {
  if (store.prisma) {
    const count = await store.prisma.briefItem.count({
      where: { itemId },
    });

    return count > 0;
  }

  return Boolean(
    store.database
      .prepare("SELECT 1 FROM brief_items WHERE item_id = ? LIMIT 1")
      .get(itemId),
  );
}

// --- Slice A: read/unread, filtered listing, unread count ---

export async function markBriefRead(
  store: Store,
  briefId: string,
  actorId?: string,
): Promise<void> {
  if (store.prisma) {
    if (actorId) {
      await store.prisma.briefRead.upsert({
        where: {
          briefId_actorId: {
            briefId,
            actorId,
          },
        },
        create: {
          briefId,
          actorId,
        },
        update: {
          readAt: new Date(),
        },
      });
    } else {
      await store.prisma.brief.update({
        where: { id: briefId },
        data: { isRead: true },
      });
    }
    return;
  }

  if (actorId) {
    store.database
      .prepare(
        `INSERT INTO brief_reads (brief_id, actor_id, read_at)
         VALUES (?, ?, ?)
         ON CONFLICT(brief_id, actor_id) DO UPDATE SET read_at = excluded.read_at`,
      )
      .run(briefId, actorId, new Date().toISOString());
    return;
  }

  store.database.prepare("UPDATE briefs SET is_read = 1 WHERE id = ?").run(briefId);
}

export async function markBriefUnread(
  store: Store,
  briefId: string,
  actorId?: string,
): Promise<void> {
  if (store.prisma) {
    if (actorId) {
      await store.prisma.briefRead.deleteMany({
        where: {
          briefId,
          actorId,
        },
      });
    } else {
      await store.prisma.brief.update({
        where: { id: briefId },
        data: { isRead: false },
      });
    }
    return;
  }

  if (actorId) {
    store.database
      .prepare("DELETE FROM brief_reads WHERE brief_id = ? AND actor_id = ?")
      .run(briefId, actorId);
    return;
  }

  store.database.prepare("UPDATE briefs SET is_read = 0 WHERE id = ?").run(briefId);
}

export async function countUnreadBriefs(
  store: Store,
  filters: { actorId?: string } = {},
): Promise<number> {
  if (store.prisma) {
    return store.prisma.brief.count({
      where: {
        ...(filters.actorId
          ? { briefReads: { none: { actorId: filters.actorId } } }
          : { isRead: false }),
        ...(filters.actorId
          ? {
              topic: {
                ownerId: filters.actorId,
              },
            }
          : {}),
      },
    });
  }

  const row = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM briefs
             JOIN topics ON briefs.topic_id = topics.id
             LEFT JOIN brief_reads
               ON brief_reads.brief_id = briefs.id
              AND brief_reads.actor_id = ?
             WHERE brief_reads.actor_id IS NULL
               AND topics.owner_id = ?`,
          )
          .get(filters.actorId, filters.actorId)
      : store.database
          .prepare("SELECT COUNT(*) AS count FROM briefs WHERE is_read = 0")
          .get()
  ) as { count: number };

  return row.count;
}

export async function listBriefsFiltered(
  store: Store,
  filters: { topicId?: string; unreadOnly?: boolean; actorId?: string } = {},
): Promise<BriefRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.brief.findMany({
      where: {
        ...(filters.topicId ? { topicId: filters.topicId } : {}),
        ...(filters.unreadOnly
          ? filters.actorId
            ? { briefReads: { none: { actorId: filters.actorId } } }
            : { isRead: false }
          : {}),
        ...(filters.actorId
          ? {
              topic: {
                ownerId: filters.actorId,
              },
            }
          : {}),
      },
      orderBy: [
        { importanceScore: "desc" },
        { relevanceScore: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        ...(filters.actorId
          ? {
              briefReads: {
                where: { actorId: filters.actorId },
                select: { actorId: true },
              },
            }
          : {}),
        topic: true,
      },
    });

    return rows.map(mapPrismaBrief);
  }

  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.topicId) {
    conditions.push("briefs.topic_id = ?");
    params.push(filters.topicId);
  }
  if (filters.unreadOnly) {
    conditions.push(
      filters.actorId ? "brief_reads.actor_id IS NULL" : "briefs.is_read = 0",
    );
  }
  if (filters.actorId) {
    conditions.push("topics.owner_id = ?");
    params.push(filters.actorId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = store.database
    .prepare(
      `SELECT
         briefs.id,
         briefs.topic_id,
         briefs.title,
         briefs.summary,
         briefs.why_it_matters,
         briefs.source_citations,
         briefs.relevance_score,
         briefs.importance_score,
         briefs.tags_json,
         ${
           filters.actorId
             ? "CASE WHEN brief_reads.actor_id IS NULL THEN 0 ELSE 1 END"
             : "briefs.is_read"
         } AS is_read,
         briefs.created_at,
         topics.title AS topic_title
       FROM briefs
       JOIN topics ON briefs.topic_id = topics.id
       ${
         filters.actorId
           ? "LEFT JOIN brief_reads ON brief_reads.brief_id = briefs.id AND brief_reads.actor_id = ?"
           : ""
       }
       ${where}
       ORDER BY briefs.importance_score DESC, briefs.relevance_score DESC, briefs.created_at DESC`,
    )
    .all(
      ...(filters.actorId ? [filters.actorId, ...params] : params),
    ) as BriefRow[];

  return rows.map(mapBrief);
}

export async function createReportRecord(
  store: Store,
  input: {
    topicId: string;
    mode: ReportMode;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    markdown: string;
    itemIds: string[];
    briefIds: string[];
    sourceCitations: string[];
    periodStart?: string | null;
    periodEnd?: string | null;
  },
): Promise<string> {
  if (store.prisma) {
    const report = await store.prisma.report.create({
      data: {
        topicId: input.topicId,
        mode: input.mode,
        title: input.title,
        summary: input.summary,
        contentJson: input.content as Prisma.InputJsonValue,
        markdown: input.markdown,
        itemIds: input.itemIds,
        briefIds: input.briefIds,
        sourceCitations: input.sourceCitations,
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
      },
    });

    return report.id;
  }

  const id = randomUUID();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO reports (
        id,
        topic_id,
        mode,
        title,
        summary,
        content_json,
        markdown,
        item_ids,
        brief_ids,
        source_citations,
        period_start,
        period_end,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.topicId,
      input.mode,
      input.title,
      input.summary,
      JSON.stringify(input.content),
      input.markdown,
      JSON.stringify(input.itemIds),
      JSON.stringify(input.briefIds),
      JSON.stringify(input.sourceCitations),
      input.periodStart ?? null,
      input.periodEnd ?? null,
      timestamp,
    );

  return id;
}

export async function listReportsByTopic(
  store: Store,
  topicId: string,
): Promise<ReportRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.report.findMany({
      where: { topicId },
      include: { topic: true },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaReport);
  }

  const rows = store.database
    .prepare(
      `SELECT reports.*, topics.title AS topic_title
       FROM reports
       JOIN topics ON topics.id = reports.topic_id
       WHERE reports.topic_id = ?
       ORDER BY reports.created_at DESC`,
    )
    .all(topicId) as ReportRow[];

  return rows.map(mapReport);
}

export async function getReportById(
  store: Store,
  reportId: string,
): Promise<ReportRecord | null> {
  if (store.prisma) {
    const report = await store.prisma.report.findUnique({
      where: { id: reportId },
      include: { topic: true },
    });

    return report ? mapPrismaReport(report) : null;
  }

  const row = store.database
    .prepare(
      `SELECT reports.*, topics.title AS topic_title
       FROM reports
       JOIN topics ON topics.id = reports.topic_id
       WHERE reports.id = ?
       LIMIT 1`,
    )
    .get(reportId) as ReportRow | undefined;

  return row ? mapReport(row) : null;
}

// --- Slice A + B: delete functions ---

export async function deleteBrief(
  store: Store,
  briefId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.brief.delete({
      where: { id: briefId },
    });
    return;
  }

  store.database.prepare("DELETE FROM briefs WHERE id = ?").run(briefId);
}

export async function deleteSource(
  store: Store,
  sourceId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.source.delete({
      where: { id: sourceId },
    });
    return;
  }

  store.database.prepare("DELETE FROM sources WHERE id = ?").run(sourceId);
}

export async function deleteTopic(
  store: Store,
  topicId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.topic.delete({
      where: { id: topicId },
    });
    return;
  }

  store.database.prepare("DELETE FROM topics WHERE id = ?").run(topicId);
}

// --- AI Topic Intent, Profiles, Controls & Grounded Chat thread store helpers ---

export async function getTopicById(
  store: Store,
  topicId: string,
): Promise<TopicRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.topic.findUnique({
      where: { id: topicId },
    });

    return row ? mapPrismaTopic(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM topics WHERE id = ? LIMIT 1")
    .get(topicId) as TopicRow | undefined;

  return row ? mapTopic(row) : null;
}

export async function getTopicProfile(
  store: Store,
  topicId: string,
): Promise<TopicProfile | null> {
  if (store.prisma) {
    const topic = await store.prisma.topic.findUnique({
      where: { id: topicId },
      select: { topicProfile: true },
    });

    return (topic?.topicProfile as TopicProfile | null) ?? null;
  }

  const topic = await getTopicById(store, topicId);
  return topic ? topic.topicProfile ?? null : null;
}

export async function saveTopicProfile(
  store: Store,
  topicId: string,
  profile: TopicProfile,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.topic.update({
      where: { id: topicId },
      data: {
        topicProfile: profile as Prisma.InputJsonValue,
      },
    });

    return;
  }

  const timestamp = new Date().toISOString();
  store.database
    .prepare("UPDATE topics SET topic_profile = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(profile), timestamp, topicId);
}

export async function updateTopicScheduleProfile(
  store: Store,
  topicId: string,
  profile: TopicScheduleProfile | null,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.topic.update({
      where: { id: topicId },
      data: {
        scheduleProfile: profile
          ? (profile as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return;
  }

  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      "UPDATE topics SET schedule_profile = ?, updated_at = ? WHERE id = ?",
    )
    .run(profile ? JSON.stringify(profile) : null, timestamp, topicId);
}

export async function updateTopicDeliveryChannels(
  store: Store,
  topicId: string,
  channels: string[],
): Promise<void> {
  const uniqueChannels = [...new Set(channels)].filter(Boolean);

  if (store.prisma) {
    await store.prisma.topic.update({
      where: { id: topicId },
      data: {
        deliveryChannels: uniqueChannels as Prisma.InputJsonValue,
      },
    });

    return;
  }

  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      "UPDATE topics SET delivery_channels = ?, updated_at = ? WHERE id = ?",
    )
    .run(JSON.stringify(uniqueChannels), timestamp, topicId);
}

export async function replaceRecommendationBundles(
  store: Store,
  topicId: string,
  bundles: RecommendationBundle[],
): Promise<void> {
  if (store.prisma) {
    await store.prisma.$transaction(async (tx) => {
      await tx.recommendationBundle.deleteMany({
        where: { topicId },
      });

      if (bundles.length === 0) {
        return;
      }

      await tx.recommendationBundle.createMany({
        data: bundles.map((bundle, index) => ({
          id: randomUUID(),
          topicId,
          position: index,
          bundleJson: bundle as Prisma.InputJsonValue,
        })),
      });
    });

    return;
  }

  const deleteStatement = store.database.prepare(
    "DELETE FROM recommendation_bundles WHERE topic_id = ?",
  );
  const insertStatement = store.database.prepare(
    `INSERT INTO recommendation_bundles (
      id,
      topic_id,
      position,
      bundle_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  store.database.exec("BEGIN");

  try {
    deleteStatement.run(topicId);

    for (const [index, bundle] of bundles.entries()) {
      const timestamp = new Date().toISOString();
      insertStatement.run(
        randomUUID(),
        topicId,
        index,
        JSON.stringify(bundle),
        timestamp,
        timestamp,
      );
    }

    store.database.exec("COMMIT");
  } catch (error) {
    store.database.exec("ROLLBACK");
    throw error;
  }
}

export async function listRecommendationBundlesByTopic(
  store: Store,
  topicId: string,
): Promise<RecommendationBundle[]> {
  if (store.prisma) {
    const rows = await store.prisma.recommendationBundle.findMany({
      where: { topicId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    return rows.map((row) => row.bundleJson as RecommendationBundle);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM recommendation_bundles
       WHERE topic_id = ?
       ORDER BY position ASC, created_at ASC`,
    )
    .all(topicId) as RecommendationBundleRow[];

  return rows.map(mapRecommendationBundle);
}

export async function updateTopicControls(
  store: Store,
  topicId: string,
  relevanceLevel: number,
  summaryPreference: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.topic.update({
      where: { id: topicId },
      data: {
        relevanceLevel,
        summaryPreference,
      },
    });

    return;
  }

  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `UPDATE topics
       SET relevance_level = ?,
           summary_preference = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(relevanceLevel, summaryPreference, timestamp, topicId);
}

export async function getOrCreateChatThread(
  store: Store,
  scopeType: "global" | "topic" | "brief",
  scopeId: string,
): Promise<ChatThreadRecord> {
  if (store.prisma) {
    let thread;

    try {
      thread = await store.prisma.chatThread.upsert({
        where: {
          scopeType_scopeId: {
            scopeType,
            scopeId,
          },
        },
        update: {},
        create: {
          scopeType,
          scopeId,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        thread = await store.prisma.chatThread.findUnique({
          where: {
            scopeType_scopeId: {
              scopeType,
              scopeId,
            },
          },
        });
      } else {
        throw error;
      }
    }

    if (!thread) {
      throw new Error(
        `Failed to resolve chat thread for ${scopeType}:${scopeId}.`,
      );
    }

    return mapChatThread({
      id: thread.id,
      scope_type: thread.scopeType,
      scope_id: thread.scopeId,
      created_at: thread.createdAt.toISOString(),
    });
  }

  const existing = await findChatThread(store, scopeType, scopeId);

  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO chat_threads (id, scope_type, scope_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, scopeType, scopeId, timestamp);

  return {
    id,
    scopeType,
    scopeId,
    createdAt: timestamp,
  };
}

export async function findChatThread(
  store: Store,
  scopeType: "global" | "topic" | "brief",
  scopeId: string,
): Promise<ChatThreadRecord | null> {
  if (store.prisma) {
    const existing = await store.prisma.chatThread.findUnique({
      where: {
        scopeType_scopeId: {
          scopeType,
          scopeId,
        },
      },
    });

    return existing
      ? mapChatThread({
          id: existing.id,
          scope_type: existing.scopeType,
          scope_id: existing.scopeId,
          created_at: existing.createdAt.toISOString(),
        })
      : null;
  }

  const existing = store.database
    .prepare(
      `SELECT * FROM chat_threads
       WHERE scope_type = ? AND scope_id = ?
       LIMIT 1`
    )
    .get(scopeType, scopeId) as ChatThreadRow | undefined;

  return existing ? mapChatThread(existing) : null;
}

export async function createChatMessage(
  store: Store,
  input: {
    threadId: string;
    role: "user" | "assistant";
    content: string;
    citations?: string[] | null;
    provenance?: "stored" | "mixed" | null;
  },
): Promise<ChatMessageRecord> {
  if (store.prisma) {
    const message = await store.prisma.chatMessage.create({
      data: {
        threadId: input.threadId,
        role: input.role,
        content: input.content,
        citations:
          (input.citations as Prisma.InputJsonValue | null | undefined) ?? undefined,
        provenance: input.provenance ?? null,
      },
    });

    return mapChatMessage({
      id: message.id,
      thread_id: message.threadId,
      role: message.role as "user" | "assistant",
      content: message.content,
      citations: message.citations ? JSON.stringify(message.citations) : null,
      provenance: message.provenance as "stored" | "mixed" | null,
      created_at: message.createdAt.toISOString(),
    });
  }

  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const citationsStr = input.citations ? JSON.stringify(input.citations) : null;
  const provenance = input.provenance ?? null;

  store.database
    .prepare(
      `INSERT INTO chat_messages (id, thread_id, role, content, citations, provenance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.threadId,
      input.role,
      input.content,
      citationsStr,
      provenance,
      timestamp,
    );

  return {
    id,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    citations: input.citations ?? null,
    provenance,
    createdAt: timestamp,
  };
}

export async function listChatMessages(
  store: Store,
  threadId: string,
): Promise<ChatMessageRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((message) =>
      mapChatMessage({
        id: message.id,
        thread_id: message.threadId,
        role: message.role as "user" | "assistant",
        content: message.content,
        citations: message.citations ? JSON.stringify(message.citations) : null,
        provenance: message.provenance as "stored" | "mixed" | null,
        created_at: message.createdAt.toISOString(),
      }),
    );
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM chat_messages
       WHERE thread_id = ?
       ORDER BY created_at ASC`
    )
    .all(threadId) as ChatMessageRow[];

  return rows.map(mapChatMessage);
}

export async function deleteChatMessagesByThreadId(
  store: Store,
  threadId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.chatMessage.deleteMany({
      where: { threadId },
    });
    return;
  }

  store.database
    .prepare("DELETE FROM chat_messages WHERE thread_id = ?")
    .run(threadId);
}
