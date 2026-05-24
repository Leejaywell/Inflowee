# Hotspot Radar Quality Layer Design

Date: 2026-05-24
Status: Draft approved in conversation, pending user review of written spec

## 1. Goal

Add a hotspot radar layer to Inflowee after the personal monitoring
subscription flow is in place.

The radar should let a personal user monitor a goal without hand-curating every
source. It should discover candidate updates from search and community surfaces,
analyze quality and relevance, normalize heat metrics, and feed accepted results
into the same Source, Item, Brief, and Chat pipeline used by normal
subscriptions.

This is not a separate product or a second data model. It is an additional way
to produce candidate items for a personal Task.

## 2. Relationship To Personal Subscription Flow

This spec depends on the personal monitoring flow:

```text
User -> Task -> Source -> Item -> Brief -> Chat/Delivery
```

The hotspot radar attaches to Task.

The personal subscription flow creates stable subscribed Sources. The hotspot
radar adds discovery-style Sources that search public surfaces on a schedule.

Both paths must converge before persistence:

```text
Subscribed source fetch -> Item candidate -> Quality Analysis -> Item -> Brief
Radar discovery fetch   -> Item candidate -> Quality Analysis -> Item -> Brief
```

The same quality gate should be reused for subscription preview, normal source
sync, and radar discovery.

## 3. Product Scope

### 3.1 In Scope

- Query expansion for monitoring goals
- Search discovery source type
- Platform-specific discovery providers
- Quality analysis before brief generation
- Fake, spam, and low-relevance filtering
- Normalized heat metrics
- Freshness windows
- Source/provider quotas
- Rejection reasons visible to users
- Radar results stored as normal Items when accepted

### 3.2 Out of Scope

- Full social network account management
- Paid social APIs beyond simple provider adapters
- Browser push notifications
- Email digest delivery
- Multi-user team monitoring
- Model fine-tuning
- Human feedback training loops

Notifications are a follow-up phase. This spec can produce the signals that
notifications will later use.

## 4. User Experience

The user starts from a Task created through the personal monitoring goal flow.

On the Task page, the user can enable a radar package such as:

- Search discovery
- Community discussion
- China social discovery

The UI should show:

- What the radar will search
- Expanded keywords and suggested queries
- Included providers
- Freshness window
- Expected sync cadence
- Preview results before enabling

The user should not need to configure each provider unless using an advanced
setting.

## 5. Query Expansion

Query expansion turns the user's monitoring goal into concrete search terms.

Inputs:

- Task title
- Task prompt
- Task profile keywords
- Exclusion terms
- Existing recommended queries

Outputs:

- `expandedKeywords`
- `exactPhrases`
- `broadQueries`
- `excludedTerms`
- `languageHints`

Rules:

- Always include the original user intent terms
- Include common aliases and casing variants
- Include product/company abbreviations when relevant
- Avoid overly broad generic terms
- Keep the first version bounded to 5-15 terms

If AI is unavailable, local fallback should split the prompt into meaningful
terms and reuse task profile keywords.

## 6. Discovery Source Types

Add radar-oriented source types only if they still map into the existing Source
model.

Recommended source types:

- `SEARCH_DISCOVERY`
- `COMMUNITY_DISCOVERY`
- `SOCIAL_DISCOVERY`

These are not separate item pipelines. They are Source records with different
fetch/extract behavior.

Each discovery Source stores:

- `taskId`
- `sourceType`
- `title`
- `url`, using a stable provider URI such as `radar://search-discovery`
- `syncIntervalMinutes`
- `nextSyncAt`
- `configJson Json?` for provider list, expanded query set, freshness window,
  and quotas

The first implementation should support a small provider set. Additional
providers can be added behind the same adapter interface.

## 7. Provider Adapters

Each provider adapter returns candidate items in a shared shape.

Candidate shape:

- `title`
- `canonicalUrl`
- `summary`
- `rawContent`
- `publishedAt`
- `sourceProvider`
- `sourceNativeId`
- `author`
- `heatMetrics`
- `providerMetadata`

Initial provider candidates:

- Bing search
- Hacker News search
- Weibo search
- Bilibili search

Provider support can be incremental. A provider that needs credentials should
fail clearly and not block other providers.

## 8. Freshness And Quotas

Radar discovery should avoid flooding the inbox.

Initial rules:

- Default freshness window: 7 days
- Provider result quota: 10 accepted candidates per provider per run
- Total quality-analysis quota: 30 candidates per radar source per run
- Existing URL and content hash dedupe still apply
- Previously rejected content should not be retried within the same run

Provider priority can be configured in code first:

1. High-signal community or social sources
2. Search discovery
3. Lower-confidence generic search results

This keeps the first version deterministic without adding a user-facing ranking
configuration.

## 9. Quality Analysis Layer

Quality analysis is the center of the radar feature.

It receives:

- Task
- Source
- Candidate item
- Expanded keyword set
- Provider metadata

It returns:

- `isReal`
- `relevanceScore`
- `relevanceReason`
- `keywordMentioned`
- `matchedTerms`
- `importanceScore`
- `qualityStatus`
- `qualityError`
- normalized heat metrics

Status values:

- `accepted`
- `rejected`
- `error`

Soft filtering rules:

- Fake or spam content is rejected
- Relevance below 0.5 is rejected
- No keyword match and relevance below 0.65 is rejected
- Empty or content-free candidates are rejected
- AI failure falls back to local rules

Accepted items can be persisted and used for brief generation. Rejected items
should be visible in previews and sync diagnostics but should not generate
briefs.

## 10. Heat Metrics

Normalize platform metrics into cross-source fields.

Common fields:

- `viewCount`
- `likeCount`
- `commentCount`
- `shareCount`
- `replyCount`
- `repostCount`
- `sourceNativeScore`
- `authorName`
- `authorUsername`
- `authorFollowers`
- `authorVerified`

Provider-specific raw metrics should remain available in metadata so the system
does not lose detail.

Importance scoring should combine:

- Relevance score
- Freshness
- Heat metrics
- Author credibility
- Cross-source repetition

The first implementation can use a transparent rule-based score. A later version
can use AI or learned ranking.

## 11. Data Model

Add explicit fields for filtering and debugging instead of storing the whole
quality result only in generic JSON.

Recommended Source field:

- `configJson Json?`

Recommended Item fields:

- `isReal Boolean?`
- `relevanceScore Float?`
- `relevanceReason String?`
- `keywordMentioned Boolean?`
- `matchedTerms Json?`
- `qualityStatus String @default("pending")`
- `qualityError String?`
- `viewCount Int?`
- `likeCount Int?`
- `commentCount Int?`
- `shareCount Int?`
- `replyCount Int?`
- `repostCount Int?`
- `sourceNativeScore Float?`
- `authorName String?`
- `authorUsername String?`
- `authorFollowers Int?`
- `authorVerified Boolean?`

The project has no formal production version yet, so schema changes can be
clean and direct.

## 12. Preview Flow

Radar discovery should support preview before enabling.

Preview steps:

1. Build expanded queries for the Task
2. Run provider adapters with a low quota
3. Dedupe candidates
4. Run quality analysis
5. Return accepted and rejected preview items
6. Show rejection reasons and provider failures

Preview must not create a formal Source unless the user confirms.

After confirmation:

1. Create a discovery Source for the selected package
2. Persist accepted preview items
3. Generate initial briefs
4. Schedule normal radar sync

## 13. Sync Flow

Normal radar sync follows the same shape as source sync:

```text
list due radar sources
-> run provider adapters
-> dedupe candidates
-> quality analysis
-> persist accepted items
-> generate briefs
-> record sync run
-> schedule next sync
```

Provider failures should be recorded without failing the whole source when other
providers succeed.

If every provider fails, mark the radar source as error.

If providers succeed but all candidates are rejected, mark the source as success
and show rejected counts.

## 14. UI Surfaces

### 14.1 Task Page

Add a radar section under recommended subscriptions.

Show:

- Enabled radar packages
- Expanded queries
- Providers
- Freshness window
- Last sync status
- Accepted/rejected counts
- Preview button
- Enable/disable control

### 14.2 Sources Page

Discovery sources appear alongside normal sources.

Show:

- Provider group
- Sync cadence
- Health
- Last run result
- Recent rejection reasons

### 14.3 Inbox

Brief cards can show radar-origin metadata:

- Source provider
- Heat indicator
- Relevance reason
- Citations

Do not make radar-origin briefs visually separate from normal briefs. They are
normal briefs with richer provenance.

## 15. Error Handling

- Missing provider credentials should disable only that provider
- Provider timeout should produce a provider-level failure
- Invalid provider responses should not crash the sync
- Invalid AI JSON should fall back to local quality rules
- Quality-analysis failure for one item should not fail the whole run
- Rejected candidates should include a human-readable reason
- A run with zero accepted items is not automatically an error

## 16. Testing

Tests should cover:

- Query expansion with AI and fallback
- Provider adapter normalization
- Candidate dedupe
- Freshness filtering
- Provider quota enforcement
- Quality accept/reject decisions
- Heat metric normalization
- Preview does not create Source records
- Confirming preview creates a discovery Source
- Accepted candidates create Items and Briefs
- Rejected candidates do not create Briefs
- Provider partial failure still returns successful candidates
- All-provider failure marks the source as error

Validation commands:

- `pnpm prisma generate`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## 17. Implementation Phases

### Phase 1: Shared Quality Layer

- Add quality analysis service
- Add explicit Item quality fields
- Use quality gate in subscription preview and normal sync
- Show accepted/rejected counts and reasons

### Phase 2: Search Discovery Source

- Add discovery Source type
- Add query expansion
- Add Bing and Hacker News adapters
- Add radar preview and confirmation

### Phase 3: Social And Regional Providers

- Add Weibo and Bilibili adapters
- Normalize social heat metrics
- Improve provider quotas and freshness rules

### Phase 4: Notification Signals

- Expose importance and heat signals for later notification policies
- Do not implement browser or email notifications in this spec

## 18. Success Criteria

The hotspot radar succeeds when:

- A user can enable radar discovery for a personal Task
- The system expands the monitoring goal into useful queries
- Preview shows accepted and rejected candidates before enabling
- Confirmed radar packages create normal Source records
- Accepted radar candidates become normal Items and Briefs
- Low-quality or low-relevance candidates do not create Briefs
- Heat metrics and relevance reasons are visible for debugging and trust
- Provider failures are isolated and understandable
