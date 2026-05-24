# Category Tag Subscription Discovery Design

Date: 2026-05-24
Status: Draft approved in conversation, pending user review of written spec

## Goal

Add a new user subscription flow based on broad categories and interest tags.
The existing AI analysis, task intelligence, source ingestion, quality filtering,
Brief generation, report generation, and delivery behavior must remain unchanged.

The new flow should help users discover subscription sources without needing to
enter a custom URL or understand source types first.

## Non-Goals

- Do not add a top search box for arbitrary URLs, RSSHub routes, or keywords.
- Do not move custom source creation into this flow.
- Do not replace the existing advanced custom Source entry point.
- Do not change the AI analysis pipeline that produces task profiles, item
  quality, Briefs, reports, or chat answers.
- Do not require preview before adding sources.
- Do not add pagination for tags or source discovery.

## Product Direction

The subscription discovery area should feel closer to Folo's category discovery
experience than a form-based source setup page.

The user starts from broad content categories such as:

- All
- Technology
- Finance
- Lifestyle
- Programming
- Design
- Games
- Reading
- Science journals
- Hiring
- Social media
- New media
- Forums
- Blogs
- Audio/video
- Images
- Software updates

After selecting a category, the user sees a loose tag cloud. Tags should feel
like interest labels rather than filter form fields. The user can refresh the
visible batch with a "change batch" control. This is not pagination: refreshing
tags changes the visible suggestions for the current category while preserving
the selected category and any selected sources.

After selecting one or more tags, the page displays matching subscription source
candidates. The user can check sources and add them to the current Task.

## Relationship To AI Analysis

AI analysis remains a supporting signal, not a different subscription pipeline.

AI can help with:

- planning category-specific tags from the current Task profile
- ranking tags by task relevance
- ranking source candidates by relevance
- adding badges such as "highly relevant", "trending", or "AI suggested"
- explaining why a source is relevant to the current monitoring goal

AI must not change:

- `taskProfile` semantics
- Source persistence
- Item ingestion
- item quality filtering
- Brief generation
- report generation
- delivery behavior

The discovery UI should work even when AI is unavailable by falling back to
built-in categories, tags, and preset sources.

## User Flow

1. User opens a Task detail page.
2. The page shows a subscription discovery section.
3. User selects a broad category.
4. The page displays a batch of tags for that category.
5. User optionally clicks "change batch" to see a different tag batch.
6. User selects one or more tags.
7. The page displays source candidates matching the category and selected tags.
8. User checks one or more source candidates.
9. User clicks "add selected sources".
10. The system creates normal `Source` records for the current Task.
11. Existing sync, quality filtering, Brief, report, chat, and delivery flows
    continue unchanged.

Preview remains optional. If kept in the UI, it should be a secondary action for
selected sources, not a required gate.

## Information Architecture

The new discovery layer sits before `Source` creation:

```text
Task + taskProfile
  -> Discovery category
  -> Discovery tag batch
  -> Discovery source candidates
  -> User selected candidates
  -> Source records
  -> Existing ingestion and AI analysis pipeline
```

Both recommended sources and category/tag discovery sources must still write to
the same Source model.

## Data Shapes

These are TypeScript-facing design shapes. They do not require new database
tables in the first implementation.

```ts
type DiscoveryCategory = {
  id: string;
  title: string;
  description: string;
  accent: string;
  icon: string;
};

type DiscoveryTagKind =
  | "topic"
  | "source_type"
  | "trend"
  | "language"
  | "task_relevance";

type DiscoveryTag = {
  id: string;
  label: string;
  categoryId: string;
  kind: DiscoveryTagKind;
  weight: number;
};

type DiscoverySourceOrigin = "preset" | "ai" | "discovery";

type DiscoverySourceCandidate = {
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
```

## Candidate Sources

Candidate sources come from three inputs:

1. Existing `sourcePresets`
   - stable built-in sources
   - mapped into discovery categories and tags
2. AI supplemental candidates
   - generated from current Task context
   - shown only after user confirmation
   - must be converted into normal Source inputs before persistence
3. Dynamic discovery candidates
   - search/community/hotlist style candidates
   - can fail independently without blocking preset candidates

The first implementation may prioritize preset candidates plus a small AI/dynamic
candidate surface, as long as the API and UI distinguish the origin.

## Trend And Relevance Signals

Tags and source candidates can display trend signals. These signals should be
derived from available data, not invented as precise analytics.

Suggested scoring inputs:

```text
trend score = subscriber count + recent growth + AI heat + task relevance
```

When exact subscriber or growth data is unavailable, the UI should omit that
specific number and still show qualitative tags such as:

- trending
- highly relevant
- AI suggested
- popular source
- official source
- RSSHub

## Components

### `SubscriptionDiscovery`

Top-level client component for the new flow.

Responsibilities:

- hold selected category
- hold visible tag batch
- hold selected tags
- hold selected source candidates
- request or derive candidate sources
- call the action that creates Source records

### `DiscoveryCategoryGrid`

Displays broad category cards.

Responsibilities:

- show category title, icon, description, and accent
- set the active category
- reset visible tag batch when category changes

### `DiscoveryTagCloud`

Displays tags for the active category.

Responsibilities:

- show a batch of tags as loose selectable labels
- support selecting multiple tags
- support "change batch"
- avoid pagination or page numbers

### `DiscoverySourceList`

Displays matching source candidates.

Responsibilities:

- show candidate title, description, URL or route, source type, origin, and tags
- show subscriber count, heat, and relevance when available
- support checking and unchecking sources
- support optional preview
- support adding selected sources

### `discovery-catalog.ts`

Pure catalog and matching logic.

Responsibilities:

- define built-in categories
- define built-in fallback tags
- map `sourcePresets` into discovery source candidates
- merge AI and dynamic discovery candidates
- select tag batches
- filter/rank candidates by category and selected tags

The catalog logic should be testable without rendering React.

## Actions

The implementation should add a narrow server action for subscribing discovery
candidates.

Suggested action:

```ts
subscribeDiscoverySources(taskId, candidates)
```

Behavior:

- require a session actor
- assert access to the Task
- validate each candidate shape
- skip duplicate candidate URLs for the task
- create normal Source records
- revalidate the Task page and Sources page

The existing `subscribeRecommendedSources` can be reused if the candidate shape
matches. If the discovery candidate shape is broader, add a small adapter rather
than widening unrelated recommendation code.

## Error Handling

- If AI tag generation fails, show built-in tags.
- If dynamic discovery fails, hide dynamic candidates and keep preset/AI
  candidates visible.
- If a selected tag has no matching sources, show an empty state suggesting
  "change batch" or choosing another tag.
- If no sources are selected, disable the add button.
- If adding sources fails, keep the current selections and show the error.
- If the user selects duplicate sources, skip duplicates rather than creating
  repeated Source records.

## Testing Strategy

Unit tests for `discovery-catalog.ts`:

- category IDs are unique
- tag IDs are unique
- tags can be returned for a category
- changing a tag batch can return a different visible set
- source presets map into discovery candidates
- filtering by category and tags returns matching candidates
- default tags are returned when AI context is missing
- candidate ranking prefers task-relevant and high-trend sources

Action/integration tests:

- selected discovery candidates create Source records
- duplicate URLs are skipped
- invalid candidates do not create records
- existing Source model and source ingestion behavior remain unchanged

Build/type checks:

- `pnpm typecheck`
- `pnpm lint`
- focused tests for catalog/action behavior
- broader test run if shared source creation code changes

## Rollout

Implement incrementally:

1. Add catalog types and pure matching helpers.
2. Add a Task-page discovery component using built-in categories/tags and
   mapped `sourcePresets`.
3. Add source creation action for checked discovery candidates.
4. Add AI/dynamic candidate hooks behind fallback behavior.
5. Add optional preview action reuse if the user clicks preview.

This keeps the first usable version simple while preserving the path toward AI
and realtime discovery enrichment.
