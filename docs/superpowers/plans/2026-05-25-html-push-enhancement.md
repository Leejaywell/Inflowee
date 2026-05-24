# HTML Push Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional HTML summary page enhancement for each delivered Brief or Report. The normal push message remains the source of truth, and when HTML publishing succeeds the same HTML URL is appended to every configured delivery channel.

**Architecture:** Introduce owner-level HTML push settings, topic-level overrides, one `HtmlPublication` record per delivered content item, a fixed-template HTML renderer fed by structured AI JSON, a GitHub Contents API publisher, and a best-effort orchestration layer invoked from the existing delivery pipeline.

**Tech Stack:** Next.js 16 App Router, React server components/actions, TypeScript, Prisma, local SQLite store via `node:sqlite`, OpenAI-compatible chat completions through the existing AI config, GitHub Contents API via `fetch`, Vitest.

---

## Current State

- The workspace already contains the Topic rename work in progress. This plan assumes the implementation starts from the current Topic-based code shape: `Topic`, `Brief`, `Report`, and `DeliveryLog`.
- The main delivery entry points are in `src/lib/delivery.ts`:
  - `deliverStoredBriefToChannel`
  - `deliverStoredBrief`
  - `deliverTextToChannel`
  - `deliverStoredBriefToConfiguredChannels`
- Delivery logs are created and finished in `src/lib/store.ts` through `createDeliveryLog` and `finishDeliveryLog`.
- Global settings UI is in `src/app/settings/page.tsx`.
- Topic detail UI exists under `src/app/topics/[topicId]/page.tsx` in the current Topic-based workspace state.
- Existing AI calls live in `src/lib/ai.ts` and use `getAiProviderConfig()` from `src/lib/ai-config.ts`.

## Implementation Tasks

### 1. Verify Baseline Before Editing

- [ ] Run:

  ```bash
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- [ ] Expected result:
  - Typecheck exits successfully.
  - Vitest exits successfully.
  - Next build exits successfully.

- [ ] If the baseline fails because the Topic rename is incomplete, finish or commit the Topic rename separately before continuing. Do not mix Topic rename fixes into the HTML push commit unless the failing code is directly blocking this feature.

### 2. Add Data Models And Store Types

- [ ] Update `prisma/schema.prisma`.

  Add relations:

  ```prisma
  model Topic {
    htmlPushConfig TopicHtmlPushConfig?
    htmlPublications HtmlPublication[]
  }

  model Brief {
    htmlPublications HtmlPublication[]
  }

  model Report {
    htmlPublications HtmlPublication[]
  }

  model DeliveryLog {
    htmlPublicationId String?
    htmlUrl           String?
    htmlStatus        String?
    htmlPublication   HtmlPublication? @relation(fields: [htmlPublicationId], references: [id], onDelete: SetNull)
  }
  ```

  Add models:

  ```prisma
  model HtmlPushConfig {
    id                   String   @id @default(uuid())
    ownerId              String   @unique
    enabled              Boolean  @default(false)
    entitlementStatus    String   @default("available")
    stylePreset          String   @default("minimal_news")
    modulePreset         String   @default("standard_summary")
    enabledModulesJson   Json
    customPrompt         String?
    publishTarget        String   @default("github")
    githubTokenEncrypted String?
    githubRepo           String?
    githubBranch         String   @default("main")
    githubBasePath       String   @default("inflowee/html")
    publicBaseUrl        String?
    createdAt            DateTime @default(now())
    updatedAt            DateTime @updatedAt
  }

  model TopicHtmlPushConfig {
    id                 String   @id @default(uuid())
    topicId            String   @unique
    useGlobal          Boolean  @default(true)
    enabled            Boolean  @default(false)
    stylePreset        String   @default("minimal_news")
    modulePreset       String   @default("standard_summary")
    enabledModulesJson Json
    customPrompt       String?
    createdAt          DateTime @default(now())
    updatedAt          DateTime @updatedAt
    topic              Topic    @relation(fields: [topicId], references: [id], onDelete: Cascade)
  }

  model HtmlPublication {
    id               String       @id @default(uuid())
    ownerId          String
    topicId          String
    briefId          String?
    reportId         String?
    contentType      String
    contentId        String
    deliveryLogId    String?
    status           String
    title            String?
    html             String?
    htmlUrl          String?
    publishTarget    String       @default("github")
    publishPath      String?
    commitSha        String?
    error            String?
    styleConfigJson  Json
    moduleConfigJson Json
    createdAt        DateTime     @default(now())
    updatedAt        DateTime     @updatedAt
    publishedAt      DateTime?
    topic            Topic        @relation(fields: [topicId], references: [id], onDelete: Cascade)
    brief            Brief?       @relation(fields: [briefId], references: [id], onDelete: Cascade)
    report           Report?      @relation(fields: [reportId], references: [id], onDelete: Cascade)
    deliveryLogs     DeliveryLog[]

    @@index([ownerId, createdAt])
    @@index([topicId, createdAt])
    @@unique([contentType, contentId])
  }
  ```

- [ ] Create a Prisma migration with:

  ```bash
  pnpm prisma migrate dev --name html_push_enhancement
  ```

  Expected result: a new `prisma/migrations/*_html_push_enhancement/migration.sql` exists and Prisma Client generation succeeds.

- [ ] Update `src/lib/store.ts`.

  Add exported types:

  ```ts
  export type HtmlPushEntitlementStatus = "available" | "disabled" | "upgrade_required";
  export type HtmlPushStylePreset = "minimal_news" | "tech_radar" | "investment_brief" | "newsletter" | "magazine_cards";
  export type HtmlPushModulePreset = "standard_summary" | "analysis_report" | "news_flash";
  export type HtmlPushModule = "summary" | "key_content" | "ai_conclusion" | "trend_changes" | "citations" | "original_links" | "recommended_actions";
  export type HtmlPublicationStatus = "pending" | "generated" | "published" | "failed";
  ```

  Add records and helpers:

  ```ts
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

  export async function getHtmlPushConfig(store: Store, ownerId: string): Promise<HtmlPushConfigRecord | null>;
  export async function saveHtmlPushConfig(store: Store, input: SaveHtmlPushConfigInput): Promise<HtmlPushConfigRecord>;
  export async function getTopicHtmlPushConfig(store: Store, topicId: string): Promise<TopicHtmlPushConfigRecord | null>;
  export async function saveTopicHtmlPushConfig(store: Store, input: SaveTopicHtmlPushConfigInput): Promise<TopicHtmlPushConfigRecord>;
  export async function createHtmlPublication(store: Store, input: CreateHtmlPublicationInput): Promise<string>;
  export async function updateHtmlPublication(store: Store, id: string, input: UpdateHtmlPublicationInput): Promise<void>;
  export async function getHtmlPublicationByContent(store: Store, input: { contentType: "brief" | "report"; contentId: string }): Promise<HtmlPublicationRecord | null>;
  export async function listRecentHtmlPublications(store: Store, limit?: number, filters?: { ownerId?: string; topicId?: string }): Promise<HtmlPublicationRecord[]>;
  ```

- [ ] Extend SQLite schema creation and migration in `src/lib/store.ts`.

  Required SQLite tables:

  ```sql
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
    topic_id TEXT NOT NULL UNIQUE REFERENCES topics(id) ON DELETE CASCADE,
    use_global INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 0,
    style_preset TEXT NOT NULL DEFAULT 'minimal_news',
    module_preset TEXT NOT NULL DEFAULT 'standard_summary',
    enabled_modules_json TEXT NOT NULL,
    custom_prompt TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS html_publications (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    brief_id TEXT REFERENCES briefs(id) ON DELETE CASCADE,
    report_id TEXT REFERENCES reports(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    content_id TEXT NOT NULL,
    delivery_log_id TEXT,
    status TEXT NOT NULL,
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
    UNIQUE(content_type, content_id)
  );
  ```

  Required `delivery_logs` columns:

  ```sql
  html_publication_id TEXT
  html_url TEXT
  html_status TEXT
  ```

- [ ] Extend `DeliveryLogRecord`, `DeliveryLogRow`, `PrismaDeliveryLogRow`, `mapDeliveryLog`, and `mapPrismaDeliveryLogRow` to include:

  ```ts
  htmlPublicationId: string | null;
  htmlUrl: string | null;
  htmlStatus: "skipped" | "pending" | "published" | "failed" | null;
  ```

- [ ] Extend `finishDeliveryLog` input:

  ```ts
  htmlPublicationId?: string | null;
  htmlUrl?: string | null;
  htmlStatus?: "skipped" | "pending" | "published" | "failed" | null;
  ```

- [ ] Add tests in `tests/store.test.ts`.

  Test cases:
  - save and read global HTML push config in SQLite store.
  - save and read topic override in SQLite store.
  - create, update, and list `HtmlPublication`.
  - delivery log stores `htmlPublicationId`, `htmlUrl`, and `htmlStatus`.

### 3. Add Config Defaults, Validation, And Secret Handling

- [ ] Create `src/lib/html-push-config.ts`.

  Include:

  ```ts
  export const HTML_PUSH_STYLE_PRESETS = ["minimal_news", "tech_radar", "investment_brief", "newsletter", "magazine_cards"] as const;
  export const HTML_PUSH_MODULE_PRESETS = ["standard_summary", "analysis_report", "news_flash"] as const;
  export const HTML_PUSH_MODULES = ["summary", "key_content", "ai_conclusion", "trend_changes", "citations", "original_links", "recommended_actions"] as const;

  export function getDefaultHtmlPushModules(preset: HtmlPushModulePreset): HtmlPushModule[];
  export function mergeHtmlPushSettings(input: {
    globalConfig: HtmlPushConfigRecord | null;
    topicConfig: TopicHtmlPushConfigRecord | null;
  }): ResolvedHtmlPushConfig;
  export function isHtmlPushEnabled(config: ResolvedHtmlPushConfig): boolean;
  export function buildHtmlPushSkippedReason(config: ResolvedHtmlPushConfig): string | null;
  ```

  Merge rule:
  - Missing global config means disabled.
  - `entitlementStatus !== "available"` means disabled.
  - `topicConfig.useGlobal === true` uses global settings.
  - `topicConfig.useGlobal === false` overrides enabled/style/modules/prompt only.
  - GitHub credentials always come from global settings in version 1.

- [ ] Create `src/lib/secret-box.ts`.

  Implement AES-256-GCM encryption using `INFLOWEE_SESSION_SECRET`:

  ```ts
  export function encryptSecret(value: string): string;
  export function decryptSecret(value: string): string;
  ```

  Behavior:
  - Derive a 32-byte key with SHA-256 from `process.env.INFLOWEE_SESSION_SECRET`.
  - Throw `INFLOWEE_SESSION_SECRET is required to save GitHub tokens.` when encrypting/decrypting without the secret.
  - Store values as `v1:<iv-base64>:<tag-base64>:<ciphertext-base64>`.

- [ ] Update `src/lib/validation.ts`.

  Add schemas:

  ```ts
  export const saveHtmlPushConfigSchema = z.object({
    enabled: z.boolean(),
    entitlementStatus: z.enum(["available", "disabled", "upgrade_required"]),
    stylePreset: z.enum(HTML_PUSH_STYLE_PRESETS),
    modulePreset: z.enum(HTML_PUSH_MODULE_PRESETS),
    enabledModules: z.array(z.enum(HTML_PUSH_MODULES)).min(1),
    customPrompt: z.string().max(1000).optional(),
    githubToken: z.string().max(500).optional(),
    githubRepo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional(),
    githubBranch: z.string().min(1).max(100),
    githubBasePath: z.string().min(1).max(200),
    publicBaseUrl: z.string().url().optional(),
  });

  export const saveTopicHtmlPushConfigSchema = z.object({
    topicId: z.string().uuid(),
    useGlobal: z.boolean(),
    enabled: z.boolean(),
    stylePreset: z.enum(HTML_PUSH_STYLE_PRESETS),
    modulePreset: z.enum(HTML_PUSH_MODULE_PRESETS),
    enabledModules: z.array(z.enum(HTML_PUSH_MODULES)).min(1),
    customPrompt: z.string().max(1000).optional(),
  });
  ```

- [ ] Add tests:

  - `tests/html-push-config.test.ts`
  - `tests/secret-box.test.ts`

  Required assertions:
  - preset modules are deterministic.
  - topic override merges with global GitHub settings.
  - disabled entitlement returns disabled.
  - encrypted token decrypts back to the original value.
  - missing secret throws when token encryption is attempted.

### 4. Add Structured AI Generation

- [ ] Create `src/lib/html-push-generation.ts`.

  Export:

  ```ts
  export type HtmlPushStructuredContent = {
    title: string;
    subtitle: string;
    summary: string;
    keyPoints: Array<{ title: string; body: string; url?: string }>;
    aiConclusion?: string;
    trendChanges: string[];
    recommendedActions: string[];
    citations: Array<{ label: string; url: string }>;
  };

  export type GenerateHtmlPushInput = {
    topic: TopicRecord;
    contentType: "brief" | "report";
    title: string;
    summary: string;
    body: string;
    sourceUrls: string[];
    resolvedConfig: ResolvedHtmlPushConfig;
    locale: "zh" | "en";
  };

  export async function generateHtmlPushStructuredContent(input: GenerateHtmlPushInput): Promise<HtmlPushStructuredContent>;
  export function parseHtmlPushStructuredContent(raw: string): HtmlPushStructuredContent;
  ```

- [ ] Update `src/lib/ai.ts`.

  Export a reusable JSON completion helper instead of duplicating fetch logic:

  ```ts
  export async function callOpenAIJsonCompletion(messages: Array<{ role: "system" | "user"; content: string }>): Promise<string>;
  ```

  Keep existing fallback behavior for other AI features.

- [ ] Generation behavior:
  - If no AI provider is configured, return a deterministic fallback structured object derived from the delivery payload.
  - If AI is configured, call the OpenAI-compatible provider with JSON mode.
  - Reject invalid JSON.
  - Trim arrays:
    - `keyPoints`: max 8
    - `trendChanges`: max 6
    - `recommendedActions`: max 6
    - `citations`: max 12
  - Only keep citation URLs using `http:` or `https:`.

- [ ] Add tests in `tests/html-push-generation.test.ts`.

  Required assertions:
  - parser accepts the documented JSON contract.
  - parser rejects missing title or summary.
  - fallback output includes title, summary, key points, and citations.
  - unsafe citation URLs are dropped.

### 5. Add Fixed HTML Renderer

- [ ] Create `src/lib/html-push-render.ts`.

  Export:

  ```ts
  export function renderHtmlPushDocument(input: {
    content: HtmlPushStructuredContent;
    topic: TopicRecord;
    contentType: "brief" | "report";
    contentId: string;
    stylePreset: HtmlPushStylePreset;
    enabledModules: HtmlPushModule[];
    generatedAt: Date;
  }): string;
  ```

- [ ] Renderer requirements:
  - Return a complete single-file HTML document.
  - Escape all text fields.
  - Do not render `<script>`.
  - Render links only when URL protocol is `http:` or `https:`.
  - Use inline CSS generated only from known `stylePreset` values.
  - Render only modules included in `enabledModules`.
  - Include generation metadata in the footer:

    ```text
    Generated by Inflowee
    ```

- [ ] Style presets:
  - `minimal_news`: white background, black text, compact news layout.
  - `tech_radar`: dark header, blue accents, signal cards.
  - `investment_brief`: restrained finance layout, table-like sections.
  - `newsletter`: readable email-like article flow.
  - `magazine_cards`: image-free card grid with strong section headers.

- [ ] Add tests in `tests/html-push-render.test.ts`.

  Required assertions:
  - HTML contains `<!doctype html>`.
  - malicious text such as `<script>alert(1)</script>` is escaped.
  - `javascript:` links are not rendered.
  - disabled modules are not present.
  - each style preset produces distinct CSS.

### 6. Add GitHub HTML Publisher

- [ ] Create `src/lib/html-publisher.ts`.

  Export:

  ```ts
  export type PublishHtmlInput = {
    html: string;
    path: string;
    title: string;
    commitMessage: string;
  };

  export type PublishHtmlResult = {
    url: string;
    path: string;
    commitSha?: string;
  };

  export type HtmlPublisher = {
    publish(input: PublishHtmlInput): Promise<PublishHtmlResult>;
  };

  export class GitHubHtmlPublisher implements HtmlPublisher {
    constructor(config: {
      token: string;
      repo: string;
      branch: string;
      publicBaseUrl?: string | null;
      fetchImpl?: typeof fetch;
    });

    publish(input: PublishHtmlInput): Promise<PublishHtmlResult>;
  }

  export function buildHtmlPublishPath(input: {
    basePath: string;
    topicTitle: string;
    contentType: "brief" | "report";
    contentId: string;
  }): string;
  ```

- [ ] GitHub behavior:
  - Use `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` first to detect an existing file SHA.
  - Use `PUT /repos/{owner}/{repo}/contents/{path}` to create or update.
  - Base64 encode HTML with UTF-8 support.
  - Commit message format:

    ```text
    Publish Inflowee HTML summary for {title}
    ```

  - If `publicBaseUrl` is present, return `${publicBaseUrl}/{path}`.
  - If `publicBaseUrl` is absent, return the `html_url` from GitHub API when available; otherwise return `https://github.com/{repo}/blob/{branch}/{path}`.

- [ ] Add tests in `tests/html-publisher.test.ts`.

  Required assertions:
  - publish path slugifies topic title.
  - existing file SHA is included when GET succeeds.
  - PUT body contains branch, message, content, and optional SHA.
  - public base URL wins over GitHub URL.
  - non-2xx GitHub response throws an error containing status code.

### 7. Add Delivery Orchestration

- [ ] Create `src/lib/html-push.ts`.

  Export:

  ```ts
  export type HtmlPushDeliveryInput =
    | {
        contentType: "brief";
        briefId: string;
      }
    | {
        contentType: "report";
        reportId: string;
      };

  export type HtmlPushDeliveryResult =
    | { status: "skipped"; reason: string }
    | { status: "published"; publicationId: string; htmlUrl: string }
    | { status: "failed"; publicationId?: string; error: string };

  export async function maybeCreateHtmlPublicationForDelivery(
    store: Store,
    input: HtmlPushDeliveryInput,
    options?: {
      fetchImpl?: typeof fetch;
      now?: Date;
      locale?: "zh" | "en";
    },
  ): Promise<HtmlPushDeliveryResult>;
  ```

- [ ] Orchestration behavior:
  - Load the topic and owner from the Brief or Report.
  - Load global HTML config and topic override.
  - Return `skipped` when disabled, entitlement unavailable, or GitHub config missing.
  - Reuse an existing published `HtmlPublication` for the same `{contentType, contentId}`.
  - Create one `HtmlPublication` with `pending` before generation.
  - Generate structured content.
  - Render fixed HTML.
  - Publish with `GitHubHtmlPublisher`.
  - Update publication to `published` with `htmlUrl`, `publishPath`, and `commitSha`.
  - On failure, update publication to `failed` and return `failed`.
  - Never throw for expected generation or publishing failures. Throw only for programmer errors such as an unknown content type.

- [ ] Add tests in `tests/html-push.test.ts`.

  Required assertions:
  - disabled config returns `skipped`.
  - missing GitHub config returns `skipped`.
  - successful brief creates a published publication.
  - failed publisher marks the publication failed.
  - second call for the same content reuses existing `htmlUrl`.

### 8. Wire HTML URLs Into Delivery Messages

- [ ] Update `src/lib/delivery.ts`.

  Extend adapter input:

  ```ts
  buildPayloads(input: {
    brief: { id: string; title: string; summary: string };
    html: string;
    store: Store;
    contentType?: "brief" | "report" | "message";
    htmlUrl?: string | null;
  }): Promise<DeliveryPayloadUnion[]>;
  ```

- [ ] Add helper:

  ```ts
  export function appendHtmlUrlToDeliveryText(input: {
    text: string;
    htmlUrl?: string | null;
    locale?: "zh" | "en";
  }): string;
  ```

  Chinese line:

  ```text
  查看完整 HTML 摘要：{htmlUrl}
  ```

  English line:

  ```text
  View full HTML summary: {htmlUrl}
  ```

- [ ] Apply `appendHtmlUrlToDeliveryText` inside adapter payload builders for:
  - webhook
  - slack
  - telegram
  - feishu
  - ntfy
  - dingtalk
  - wecom
  - bark
  - email text body

- [ ] Update `deliverStoredBriefToChannel`.

  Behavior:
  - Call `maybeCreateHtmlPublicationForDelivery` once before `adapter.buildPayloads`.
  - Pass `htmlUrl` only when result is `published`.
  - Include HTML status fields in `finishDeliveryLog`.

- [ ] Update `deliverTextToChannel`.

  Behavior:
  - Only call HTML enhancement when `input.contentType === "report"`.
  - Skip enhancement for `message`.
  - Include HTML status fields in `finishDeliveryLog`.

- [ ] Update `deliverStoredBriefToConfiguredChannels`.

  Behavior:
  - Generate or reuse HTML once before the channel loop.
  - Pass the same generated `htmlUrl` to each channel delivery.
  - Do not generate one HTML page per channel.

  Implement by adding an internal option to `deliverStoredBriefToChannel`:

  ```ts
  htmlPushResult?: HtmlPushDeliveryResult;
  ```

  Then `deliverStoredBriefToConfiguredChannels` can call `maybeCreateHtmlPublicationForDelivery` once and pass that result to each channel call.

- [ ] Add tests in `tests/delivery.test.ts`.

  Required assertions:
  - delivery appends URL when HTML publish succeeds.
  - delivery succeeds without URL when HTML publish fails.
  - delivery log records `htmlStatus: "published"` for successful HTML.
  - delivery log records `htmlStatus: "failed"` for failed HTML.
  - configured multi-channel delivery calls the HTML publisher once and sends the same URL to every channel.

### 9. Add Settings UI And Server Actions

- [ ] Update `src/app/actions.ts`.

  Add:

  ```ts
  export async function saveHtmlPushConfigAction(formData: FormData): Promise<void>;
  export async function testHtmlPushConfigAction(formData: FormData): Promise<void>;
  ```

  Behavior:
  - Require session actor.
  - Validate form data with `saveHtmlPushConfigSchema`.
  - Encrypt a newly submitted GitHub token.
  - Keep the existing encrypted token when token field is empty.
  - Redirect back to `/settings?updated=html-push`.

- [ ] Update `src/app/settings/page.tsx`.

  Add a new section after delivery channel defaults:

  ```text
  HTML 推送增强
  ```

  Fields:
  - enable checkbox
  - entitlement status display
  - GitHub token password input
  - repository `owner/repo`
  - branch
  - base path
  - public base URL
  - style preset select
  - module preset select
  - enabled module checkboxes
  - custom generation prompt textarea
  - save button

  Copy:
  - Chinese title: `HTML 推送增强`
  - Chinese description: `推送简报或报告时，可选生成一份精美 HTML 摘要页，并把链接附在消息里。`
  - English title: `HTML push enhancement`
  - English description: `Optionally publish a polished HTML summary page for delivered briefs and reports, then append the link to the notification.`

- [ ] Update `src/lib/i18n.ts`.

  Add localized strings for all new settings labels and validation messages.

- [ ] Add or update page tests if the repo has settings page render tests. If no page render tests exist, rely on typecheck/build verification.

### 10. Add Topic Override UI And Preview

- [ ] Update `src/app/actions.ts`.

  Add:

  ```ts
  export async function saveTopicHtmlPushConfigAction(formData: FormData): Promise<void>;
  export async function previewTopicHtmlPushAction(formData: FormData): Promise<void>;
  ```

  Behavior:
  - Require session actor.
  - Assert topic access.
  - Validate form data with `saveTopicHtmlPushConfigSchema`.
  - Save topic override.
  - Preview finds the latest Brief for the topic first. If no Brief exists, find the latest Report. If neither exists, redirect with an error.
  - Preview renders HTML and stores a `generated` publication without publishing to GitHub.

- [ ] Update `src/app/topics/[topicId]/page.tsx`.

  Add an `HTML 摘要` section near the delivery controls:
  - use global settings checkbox
  - enable override checkbox
  - style preset select
  - module preset select
  - enabled module checkboxes
  - custom prompt textarea
  - save button
  - preview button
  - recent HTML publication status list

- [ ] Add localized strings in `src/lib/i18n.ts`.

- [ ] Add tests for actions in an existing action test file or create `tests/html-push-actions.test.ts`.

  Required assertions:
  - user cannot save override for a topic they do not own.
  - saving override persists module and style choices.
  - preview without eligible content redirects with a clear error.

### 11. Show HTML Publication Status In Settings

- [ ] Update `src/app/settings/page.tsx`.

  Include recent HTML publication failures in the delivery health area:
  - title
  - content type
  - status
  - error text
  - created time

- [ ] Add store query usage:

  ```ts
  listRecentHtmlPublications(defaultStore, 8, { ownerId: actor.id })
  ```

- [ ] Do not block settings render if there are no publications.

### 12. Full Verification

- [ ] Run focused tests first:

  ```bash
  pnpm test tests/html-push-config.test.ts tests/html-push-generation.test.ts tests/html-push-render.test.ts tests/html-publisher.test.ts tests/html-push.test.ts tests/delivery.test.ts tests/store.test.ts
  ```

- [ ] Expected result:
  - All focused tests pass.

- [ ] Run full checks:

  ```bash
  pnpm typecheck
  pnpm lint
  pnpm test
  pnpm build
  ```

- [ ] Expected result:
  - Typecheck passes.
  - Lint passes.
  - Full test suite passes.
  - Production build passes.

- [ ] Manual local verification:
  - Start the app with `pnpm dev`.
  - Open `/settings`.
  - Enable HTML push enhancement with a test GitHub repository.
  - Open a topic detail page and save a topic override.
  - Deliver a Brief to a configured test webhook.
  - Confirm the webhook payload includes `查看完整 HTML 摘要：{htmlUrl}` or `View full HTML summary: {htmlUrl}`.
  - Confirm the generated HTML file appears in the configured GitHub repository path.
  - Confirm disabling HTML push removes the HTML link while the delivery still succeeds.

## Commit Plan

- [ ] Commit 1: data model, store helpers, and tests.
- [ ] Commit 2: config merge, validation, secret handling, AI generation, renderer, publisher, and tests.
- [ ] Commit 3: delivery integration, settings UI, topic override UI, preview, and tests.

Keep each commit focused. Do not include unrelated Topic rename changes unless they are already part of the target branch baseline.

## Failure And Rollback Notes

- HTML generation and publishing must never block Brief or Report delivery.
- GitHub token storage requires `INFLOWEE_SESSION_SECRET`; token saving should fail clearly when the secret is missing.
- If GitHub publishing fails, record the failure in `HtmlPublication.error` and set `DeliveryLog.htmlStatus` to `failed`.
- If a deployment needs to disable the feature quickly, set global HTML push config `enabled` to false.
