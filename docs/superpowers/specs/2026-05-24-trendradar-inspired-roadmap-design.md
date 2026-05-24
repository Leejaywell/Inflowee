# TrendRadar-Inspired Roadmap Design

Date: 2026-05-24
Status: Draft approved in conversation, pending user review of written spec

## 1. Goal

Use SANSAN0/TRENDRADAR as a reference for broad trend monitoring features, but
integrate the useful parts into Inflowee's personal monitoring product instead
of copying TRENDRADAR as a parallel subsystem.

The target Inflowee product chain remains:

```text
Task -> Source -> Item -> Brief -> Report -> Delivery / Chat / MCP
```

The roadmap should add:

- Hotlist platform aggregation
- Periodic trend reports
- Timeline-based monitoring cadence
- Delivery channel adapters
- MCP tools for external AI clients

All phases must preserve the existing personal user flow: the user starts from a
monitoring goal, not from a global config file.

## 2. Reference Summary

TRENDRADAR combines several capabilities:

- Multi-platform hotlist aggregation
- RSS subscriptions
- Keyword and AI-based filtering
- AI analysis reports
- AI translation
- Timeline scheduling
- HTML and Markdown report output
- Push channels including WeChat, Feishu, DingTalk, Telegram, email, ntfy, Bark,
  Slack, and generic webhooks
- Local or remote storage
- MCP tools for external AI clients

Reference material:

- Repository: https://github.com/SANSAN0/TRENDRADAR
- Config reference: https://raw.githubusercontent.com/SANSAN0/TRENDRADAR/master/config/config.yaml

The Inflowee design should borrow the product ideas, not the configuration
shape. Inflowee already has Task, Source, Item, Brief, delivery logs, chat
grounding, source presets, and discovery providers. New capabilities should use
those surfaces first.

## 3. Chosen Approach

Use an Inflowee-native staged roadmap.

Rejected alternatives:

- TrendRadar compatibility layer: too likely to create a second product entry
  based on YAML-like configuration instead of monitoring goals.
- Independent hotlist module: faster to ship, but it would split the product
  into a separate radar area that does not reinforce Task-based monitoring.

Chosen approach:

- Keep Task as the user's monitoring goal.
- Convert each new input into Source or Source provider behavior.
- Convert each raw result into Item.
- Keep Brief as a focused signal summary.
- Add Report for time-window analysis.
- Reuse Delivery and Chat.
- Add MCP as an integration boundary after core data is reliable.

## 4. Phase 1: Hotlist Platforms As Sources

### 4.1 Goal

Introduce TRENDRADAR-style hotlist aggregation without creating a separate
hotlist product.

The user should be able to add a "whole-web hotlist discovery" package to a
Task. The package should query hotlist platforms, filter items against the
Task's monitoring goal, and feed accepted results into the normal Item and Brief
pipeline.

### 4.2 Platforms

Initial platform candidates:

- Weibo
- Zhihu
- Bilibili
- Baidu Hot Search
- Toutiao
- Douyin
- The Paper
- CLS / Cailian Press

Platform coverage can be incremental. A provider adapter can be enabled only
after it has stable extraction and tests.

### 4.3 Data Model

Add a hotlist-oriented Source type:

- `HOTLIST_DISCOVERY`

This keeps public ranking platforms distinct from social keyword discovery.
Hotlist Sources store provider configuration in `Source.configJson`, using the
same pattern as existing discovery Sources.

Accepted hotlist results become normal Items with additional metadata:

- `platform`
- `rank`
- `hotScore`
- `rankTimeline`
- `providerMetadata`

For the first phase, only current rank and hot score are required. Full rank
timeline is a later enhancement.

### 4.4 User Experience

Do not add a separate hotlist center in the first phase.

Expose hotlist capability through:

- Task recommended subscriptions
- Sources preset list
- Source diagnostics
- Brief metadata when a brief was generated from hotlist items

The user-facing copy should explain that this is a discovery source that scans
public hotlists for the Task's monitoring goal.

### 4.5 Error Handling

- Provider failure is recorded per provider.
- If some providers succeed, the Source sync can still succeed with warnings.
- If all providers fail, mark the Source as error.
- If providers return items but none match the Task, mark sync as success and
  show "platforms reachable, no matching content."

### 4.6 Acceptance Criteria

- A Task can add a hotlist discovery package.
- At least two platform adapters can return normalized candidates.
- Accepted candidates become Items and can generate Briefs.
- Provider-level failures are visible in sync diagnostics.
- Rejected or low-relevance items do not create Briefs.

## 5. Phase 2: Periodic Trend Reports

### 5.1 Goal

Add a Report layer for time-window trend analysis.

Briefs answer: "What happened in this signal?"

Reports answer: "What changed across the monitored topic during this time
window?"

### 5.2 Report Scope

Reports attach to Task first. Global reports can be added later by combining
multiple Tasks.

Report modes:

- `current`: analyze the current window of available content.
- `daily`: analyze the day's full set of matching content.
- `incremental`: analyze only content added since the previous report.

### 5.3 Report Content

Each Report contains:

- Core trends
- Disputes and diverging viewpoints
- Weak signals
- Suggested next watch points
- Source index with linked Items and Briefs

Reports should have a structured JSON payload and rendered surfaces:

- Web page
- Markdown export
- Delivery payload
- Chat grounding record

### 5.4 AI And Fallback

AI report generation is preferred when configured.

Fallback behavior:

- Cluster Items by topic tags and source overlap.
- Rank clusters by importance and freshness.
- Produce a deterministic report with trend headings, source counts, and top
  citations.

Fallback reports must be clearly usable, not just an error message.

### 5.5 Acceptance Criteria

- A Task can generate a `current` Report from stored Items and Briefs.
- `daily` and `incremental` modes have deterministic time-window selection.
- Report rendering supports web and Markdown.
- Reports can be used as Chat grounding.
- AI failure falls back to local report generation.

## 6. Phase 3: Timeline Scheduling And Report Modes

### 6.1 Goal

Upgrade simple Source cadence into Task-level monitoring rhythm.

TRENDRADAR uses timeline configuration to decide when to collect, analyze, and
push. Inflowee should expose this as personal monitoring cadence, not YAML.

### 6.2 Presets

Task schedule presets:

- Always on
- Morning and evening summary
- Office hours
- Nightly summary
- Custom

Each preset maps to one or more time windows.

### 6.3 Window Capabilities

Each time window can configure:

- Collect sources
- Generate Briefs
- Generate Reports
- Push notifications
- Report mode: `current`, `daily`, or `incremental`
- Filter mode: keyword or AI relevance
- Maximum pushed items

### 6.4 Storage

Use Task-level configuration first. Do not introduce a separate schedule table
until the shape proves stable.

Candidate storage:

```text
Task.scheduleProfile Json?
```

If schedule profiles grow too large or need querying across Tasks, split them
into a dedicated table later.

### 6.5 Scheduler Behavior

Scheduled jobs evaluate:

1. Which Sources are due
2. Which Tasks are inside an active collect window
3. Whether Brief generation is enabled
4. Whether Report generation is enabled
5. Whether Delivery is enabled

Source `nextSyncAt` remains relevant, but it is gated by Task schedule windows.

### 6.6 Error Handling

- Overlapping custom windows fail validation.
- Cross-midnight windows are allowed if represented explicitly.
- Closed push windows do not block storage.
- AI analysis failure does not block collection.

### 6.7 Acceptance Criteria

- A Task can use a schedule preset.
- Custom windows reject overlaps.
- Scheduled sync respects collect windows.
- Report generation respects analysis windows.
- Push behavior respects delivery windows.

## 7. Phase 4: Delivery Channel Adapter System

### 7.1 Goal

Turn delivery from page-specific forms into a channel adapter system.

Inflowee already supports Webhook, Slack, Telegram, and Feishu. The roadmap
adds:

- DingTalk
- WeCom / enterprise WeChat
- Email SMTP
- ntfy
- Bark
- Generic webhook templates

### 7.2 Channel Model

Introduce a unified `DeliveryChannel` shape:

- `type`
- `enabled`
- `name`
- `credentials`
- `format`
- `limits`
- `createdAt`
- `updatedAt`

Credentials must not be exposed in server-rendered pages or MCP responses.

### 7.3 Format Guides

Each adapter declares:

- Supported content type: Markdown, HTML, plain text, or JSON
- Maximum payload size
- Link support
- Button/card support
- Batch separator
- Message title rules

The delivery layer uses the guide to render channel-specific payloads.

### 7.4 Content Types

Delivery supports:

- Brief
- Report
- AI-written message generated from Chat or MCP

Long content is split into batches according to channel limits.

### 7.5 User Experience

Settings becomes:

- Channel list
- Add channel
- Edit channel
- Test send
- Recent logs per channel
- Default channels
- Task-level channel override

Do not keep adding one large form per provider.

### 7.6 Acceptance Criteria

- Existing channels still work through the adapter interface.
- At least one new channel can be added through the same UI.
- Long messages split correctly.
- Channel failures are logged independently.
- Task-level delivery override works for Reports and Briefs.

## 8. Phase 5: MCP And External AI Tool Layer

### 8.1 Goal

Expose Inflowee's stored monitoring data to external AI clients through MCP.

The first version should be read-only by default. Write actions are opt-in.

### 8.2 Tools

Read tools:

- `list_tasks`
- `search_items`
- `list_briefs`
- `read_brief`
- `read_item`

Controlled write/action tools:

- `generate_report`
- `send_report`

Write/action tools require explicit server configuration.

### 8.3 Resources

Expose resources:

- `tasks`
- `sources`
- `briefs`
- `reports`
- `delivery_channels`

Delivery channel resources expose status and type, not secrets.

### 8.4 Security

- MCP requests are scoped to the current local user or token user.
- Default mode is read-only.
- Report generation and delivery are disabled unless explicitly enabled.
- OAuth secrets, channel tokens, and raw environment variables are never exposed.
- Tool responses should return structured `{ success, summary, data, error }`
  objects.

### 8.5 Acceptance Criteria

- External MCP client can list Tasks and read Briefs.
- Search returns Items with citations.
- Unauthorized write tools are rejected.
- Enabled report generation creates a Report for a Task.
- Delivery tool can send only to already configured channels.

## 9. Shared Architecture

### 9.1 Provider Adapters

Use adapter interfaces for external sources:

```text
ProviderAdapter.fetch(config, task) -> CandidateItem[]
```

Adapters should normalize fields before quality analysis. Platform-specific
metadata belongs in `structuredFields` or a dedicated metadata object.

### 9.2 Quality Gate

All candidate inputs should pass through the same quality gate:

```text
Source fetch -> Candidate -> Enrichment -> Quality -> Item -> Brief/Report
```

This applies to:

- RSS
- Structured pages
- Discovery providers
- Hotlist providers

### 9.3 Report Generation

Reports are built from stored Items and Briefs. Report generation should not
perform source fetching. This keeps collection and analysis separable.

### 9.4 Delivery

Brief and Report delivery share the same delivery adapter layer.

The delivery layer should not know how content was collected. It receives a
renderable content object and a channel configuration.

## 10. Testing Strategy

### 10.1 Unit Tests

- Hotlist provider parsing
- Candidate normalization
- Quality gate acceptance and rejection
- Report window selection
- Report fallback generation
- Schedule window matching
- Schedule overlap validation
- Channel formatting and payload splitting
- MCP permission checks

### 10.2 Integration Tests

- Hotlist Source sync creates Items and Briefs.
- Partial provider failure records warnings without failing the full sync.
- Report generation uses existing Items and Briefs.
- Scheduled job respects Task windows.
- Delivery adapters write logs on success and failure.
- MCP read tools return actor-scoped data only.

### 10.3 Build And Smoke Checks

Each phase should pass:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

UI phases should also run a local smoke check for the relevant page.

## 11. Phase Order

Recommended order:

1. Hotlist platforms as Sources
2. Periodic Trend Reports
3. Timeline Scheduling
4. Delivery Channel Adapter System
5. MCP and External AI Tool Layer

Reasoning:

- Hotlist Sources add raw signal coverage first.
- Reports need stored signal coverage to be useful.
- Scheduling is more valuable after Reports exist.
- Delivery expansion should send both Briefs and Reports.
- MCP is strongest after the internal data and report model are stable.

## 12. Non-Goals

This roadmap does not include:

- Replacing the personal monitoring goal flow with YAML configuration
- Public multi-tenant team workspaces
- Full browser extension capture
- Training user-specific models
- Exposing private credentials through MCP
- Building a separate TrendRadar clone inside the app

## 13. Success Criteria

The roadmap succeeds when:

- A user can add public hotlist discovery to a monitoring Task.
- Hotlist, RSS, structured, and discovery results share the same Item pipeline.
- A user can generate a trend Report for a Task.
- A user can choose when to collect, analyze, and push.
- Delivery channels are configured through one adapter model.
- External AI clients can safely query Inflowee data through MCP.
- The app still feels like a personal monitoring product, not a config-driven
  operations dashboard.
