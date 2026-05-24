# HTML Push Enhancement Design

## Summary

HTML Push Enhancement is an optional delivery enhancement for Inflowee topics. It does not create a public topic homepage. Instead, when a Brief or Report is delivered, the system can generate a polished HTML summary page for that specific delivery and append the page link to the existing text notification.

The feature is best-effort. If HTML generation, rendering, or publishing fails, the original delivery still succeeds without the HTML link. The first version reserves entitlement fields for future paid plans, but it does not implement billing.

## Goals

- Let users enable an optional HTML summary page for pushed Briefs and Reports.
- Let users customize what the HTML page contains, including summary, key content, AI conclusion, trend changes, citations, original links, and recommended actions.
- Let users choose a visual style preset and add natural-language generation instructions.
- Publish generated HTML to a configured GitHub repository.
- Append the published HTML URL to all delivery channels through the existing delivery pipeline.
- Preserve delivery reliability by degrading to plain text when HTML enhancement fails.
- Reserve plan or entitlement fields so the feature can later become a paid capability.

## Non-Goals

- No public topic homepage in the first version.
- No long-lived `index.html` that is continuously maintained for a topic.
- No payment or subscription implementation.
- No direct raw HTML editor in the first version.
- No drag-and-drop module ordering in the first version.
- No publishing targets beyond GitHub in the first version, though the interface should allow future targets.
- No channel-specific rich formatting beyond appending the same HTML URL to each delivery message.

## User Experience

### Global Settings

Add an HTML Push Enhancement section to settings.

Configuration fields:

- Enable HTML Push Enhancement.
- Entitlement status, shown as an experimental or reserved paid feature state.
- GitHub Personal Access Token.
- GitHub repository in `owner/repo` format.
- Branch, defaulting to `main`.
- Base path, for example `inflowee/html`.
- Optional public base URL, for example `https://username.github.io/repo`.
- Default visual style:
  - Minimal news
  - Tech radar
  - Investment brief
  - Newsletter
  - Magazine cards
- Content module preset:
  - Standard summary: summary, key content, citations.
  - Analysis report: summary, AI conclusion, trend changes, recommended actions, citations.
  - News flash: summary, key content, original links.
- Enabled content modules:
  - Push summary
  - Key content list
  - AI conclusion
  - Trend changes
  - Source citations
  - Original links
  - Recommended actions
- Custom generation prompt, such as: "Write for non-technical readers and emphasize impact."

### Topic Override

Topic detail pages can override the global HTML configuration.

Fields:

- Use global settings or customize this topic.
- Enable or disable HTML enhancement for this topic.
- Topic-specific style preset.
- Topic-specific module preset and enabled modules.
- Topic-specific generation prompt.
- Test preview for the latest eligible Brief or Report.

### Delivery Message

Existing delivery messages keep their current text summary. When an HTML page is successfully published, the delivery message appends:

- Chinese: `查看完整 HTML 摘要：{htmlUrl}`
- English: `View full HTML summary: {htmlUrl}`

All configured delivery channels use the same URL.

## Data Model

### HtmlPushConfig

Stores global owner-level configuration.

Fields:

- `id`
- `ownerId`
- `enabled`
- `entitlementStatus`, for example `available`, `disabled`, or `upgrade_required`
- `stylePreset`
- `modulePreset`
- `enabledModulesJson`
- `customPrompt`
- `publishTarget`, first version `github`
- `githubTokenEncrypted`
- `githubRepo`
- `githubBranch`
- `githubBasePath`
- `publicBaseUrl`
- `createdAt`
- `updatedAt`

### TopicHtmlPushConfig

Stores per-topic overrides.

Fields:

- `id`
- `topicId`
- `useGlobal`
- `enabled`
- `stylePreset`
- `modulePreset`
- `enabledModulesJson`
- `customPrompt`
- `createdAt`
- `updatedAt`

When `useGlobal` is true, global settings drive generation. When false, topic settings override only the configurable generation fields. GitHub credentials remain global in the first version.

### HtmlPublication

Stores one generated HTML page attempt for one delivery content item.

Fields:

- `id`
- `ownerId`
- `topicId`
- `contentType`, either `brief` or `report`
- `contentId`
- `deliveryLogId`
- `status`, one of `pending`, `generated`, `published`, or `failed`
- `title`
- `html`
- `htmlUrl`
- `publishTarget`
- `publishPath`
- `commitSha`
- `error`
- `styleConfigJson`
- `moduleConfigJson`
- `createdAt`
- `updatedAt`
- `publishedAt`

### DeliveryLog Extension

Extend delivery logging with:

- `htmlPublicationId`
- `htmlUrl`
- `htmlStatus`

These fields are informational and must not change whether the main delivery is considered successful.

## Generation Pipeline

HTML generation happens during delivery, after the system knows exactly which Brief or Report is being sent.

Flow:

1. Delivery prepares a Brief or Report payload.
2. The delivery pipeline loads global HTML configuration and topic override configuration.
3. If enhancement is disabled or entitlement is unavailable, delivery proceeds as plain text.
4. If enabled, the system creates an `HtmlPublication` with status `pending`.
5. The system collects modules from the delivery content:
   - Summary
   - Brief or Report body
   - Key items
   - Trend signals
   - Citations
   - Original links
   - Recommended actions
6. AI generates structured JSON content, not raw HTML.
7. The server renders the structured content through a fixed HTML template.
8. The HTML is published to GitHub.
9. The resulting URL is appended to the delivery message.
10. `HtmlPublication` and `DeliveryLog` are updated with status and URL.

## AI Contract

AI returns structured JSON with this shape:

```json
{
  "title": "string",
  "subtitle": "string",
  "summary": "string",
  "keyPoints": [
    {
      "title": "string",
      "body": "string",
      "url": "string"
    }
  ],
  "aiConclusion": "string",
  "trendChanges": ["string"],
  "recommendedActions": ["string"],
  "citations": [
    {
      "label": "string",
      "url": "string"
    }
  ]
}
```

The prompt includes:

- Content type.
- Topic title and focus.
- Brief or Report content.
- Enabled modules.
- Style preset.
- User custom prompt.
- Output language.

If AI returns invalid JSON or misses required fields, the HTML attempt fails and delivery continues without the HTML link.

## HTML Rendering and Safety

The system renders HTML from structured JSON using fixed templates.

Safety rules:

- AI output is treated as data, not executable HTML.
- The first version does not allow `<script>`.
- Links must use `http` or `https`.
- Text content is escaped before rendering.
- CSS is generated from known style presets and whitelisted user parameters.
- Output is a complete single-file HTML document with inline CSS.

This keeps HTML quality consistent and prevents prompt-injected scripts from reaching the published page.

## GitHub Publishing

GitHub publishing uses the GitHub Contents API.

Required configuration:

- Personal Access Token.
- Repository in `owner/repo` format.
- Branch.
- Base path.
- Optional public base URL.

Publish path:

```text
{basePath}/topics/{topicSlug}/{contentType}-{contentId}.html
```

Examples:

```text
inflowee/html/topics/ai-coding-tools/brief-abc123.html
inflowee/html/topics/ai-coding-tools/report-def456.html
```

Repeated publication of the same Brief or Report overwrites the same path. The commit message is:

```text
Publish Inflowee HTML summary for {topicTitle}
```

URL behavior:

- If `publicBaseUrl` is configured, `htmlUrl` is `{publicBaseUrl}/{publishPath}`.
- If `publicBaseUrl` is missing, store a GitHub blob or raw URL as a fallback.
- The app only writes files to the repo. Users enable GitHub Pages themselves.

## Failure Handling

HTML enhancement never blocks the original delivery.

Failure cases:

- Enhancement disabled.
- Entitlement unavailable.
- AI generation failure.
- Invalid AI JSON.
- HTML rendering failure.
- Missing GitHub configuration.
- Invalid GitHub token.
- Repository, branch, or path permission failure.
- GitHub API rate limit.

Behavior:

- Delivery proceeds without `htmlUrl`.
- `HtmlPublication.status` becomes `failed` when an attempt exists.
- Failure reason is saved in `HtmlPublication.error`.
- `DeliveryLog.htmlStatus` records the HTML outcome.
- Settings or topic pages can show recent failures.

## Publishing Interface

Introduce a target-neutral publishing interface:

```ts
type PublishHtmlInput = {
  html: string;
  path: string;
  title: string;
  commitMessage: string;
};

type PublishHtmlResult = {
  url: string;
  path: string;
  commitSha?: string;
};
```

First implementation:

- `GitHubHtmlPublisher`

Future implementations:

- S3
- Cloudflare R2
- Vercel Blob
- User webhook
- Internal hosted pages

## Integration Points

- Settings page: global HTML Push Enhancement configuration.
- Topic detail page: per-topic override and preview.
- Delivery pipeline: optional HTML generation and URL attachment.
- Delivery adapters: append HTML URL to existing message text.
- Reports and Briefs: provide content payloads to the HTML generator.
- Store layer: persist configs, publications, and delivery log extension.

## Testing Plan

Unit tests:

- Global config parsing and defaults.
- Topic override merge behavior.
- Entitlement disabled means no HTML attempt.
- AI JSON parser accepts valid output and rejects invalid output.
- HTML renderer escapes text and strips script-capable content.
- Link sanitizer only accepts `http` and `https`.
- GitHub publisher builds expected path and request payload.
- Delivery pipeline continues when HTML generation fails.
- Delivery pipeline appends URL when publication succeeds.

Integration tests:

- Brief delivery with HTML disabled.
- Brief delivery with HTML enabled and GitHub publish success.
- Report delivery with HTML enabled and GitHub publish failure.
- Multi-channel delivery reuses the same generated `htmlUrl`.
- SQLite and Prisma persistence for `HtmlPublication` and config models.

Build checks:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Phasing

### Phase 1: Data Model and Configuration

- Add global HTML push config.
- Add topic override config.
- Add HTML publication record.
- Extend delivery log.
- Add settings UI for global config.

### Phase 2: HTML Generation

- Add structured AI generation.
- Add module selection and module presets.
- Add fixed HTML templates and style presets.
- Add preview endpoint or action.

### Phase 3: GitHub Publishing

- Add GitHub publisher.
- Save publish path, URL, and commit SHA.
- Add validation for repo, branch, token, and base path.

### Phase 4: Delivery Integration

- Run enhancement during Brief and Report delivery.
- Append `htmlUrl` to delivery messages.
- Ensure failures degrade to existing plain text delivery.

### Phase 5: Topic Overrides

- Add topic-level settings.
- Add test preview on topic detail page.
- Show recent HTML publication status and failures.

## Open Decisions Resolved

- The feature is not a topic homepage.
- The feature is optional and best-effort.
- The feature is available behind an entitlement-ready flag, but no payment is implemented.
- The first publishing target is GitHub.
- Users customize content through modules, style presets, and custom prompts.
- AI generates structured data, not raw HTML.
