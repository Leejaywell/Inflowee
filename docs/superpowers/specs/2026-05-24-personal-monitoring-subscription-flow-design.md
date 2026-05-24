# Personal Monitoring Subscription Flow Design

Date: 2026-05-24
Status: Draft approved in conversation, pending user review of written spec

## 1. Goal

Refactor Inflowee from a space-based information hub into a personal monitoring
subscription product.

The user should not need to understand sources, RSS feeds, source types, or
workspace hierarchy before seeing value. The primary flow should be:

1. Describe a monitoring goal in one sentence
2. Review recommended subscription packages
3. Preview whether the subscription will produce useful briefs
4. Confirm the subscription
5. Read the first generated briefs

The core product loop changes from configuring source plumbing to completing a
personal monitoring goal.

## 2. Product Direction

The product should optimize for an individual user who wants to monitor a topic
continuously.

Example monitoring goal:

> Monitor AI coding tools for new products, funding, and important updates.

The system should turn that sentence into:

- Keywords
- Exclusion terms
- Recommended search queries
- Suitable source types
- Recommended subscription packages
- Suggested sync frequency
- Suggested notification policy

The user can still manually add sources, but that is an advanced path. The
default path is a guided subscription flow.

## 3. Scope

### 3.1 In Scope

- Remove the user-visible Space concept
- Remove member and invite workflows
- Make Task the top-level personal monitoring object
- Build a guided monitoring goal creation flow
- Generate source recommendation packages from a task prompt
- Preview selected source candidates before saving them as subscriptions
- Use quality analysis during preview and sync
- Confirm selected subscriptions into the existing Source model
- Generate the first briefs after subscription confirmation
- Improve empty states so they explain the next action

### 3.2 Out of Scope

- Multi-user collaboration
- Space membership roles
- Invite links
- Full hotspot radar search across all external platforms
- Real-time browser notifications
- Email digest delivery
- User feedback training loops

Hotspot radar remains a later phase. This spec includes only the quality gate
needed by the personal subscription preview.

## 4. Current Problems

The current app asks the user to create a Space, then a Task, then configure
Sources. This has three problems for personal users:

- The Space abstraction adds hierarchy before the user has a monitoring result.
- Source setup requires users to understand implementation details too early.
- A successful source save does not prove the subscription will generate useful
  briefs.

The new flow should answer the user's real question before committing:

> Will this monitoring setup produce useful updates for my goal?

## 5. New Information Architecture

The main data chain becomes:

```text
User -> Task -> Source -> Item -> Brief -> Chat/Delivery
```

Task becomes the user's monitoring goal.

Source remains the concrete subscribed input endpoint.

Item remains the raw ingested content unit.

Brief remains the AI-processed intelligence object.

Chat remains scoped to global, task, or brief context.

## 6. Data Model Changes

### 6.1 Remove Models

Delete:

- `Space`
- `SpaceMember`
- `SpaceInvite`

Delete invite and membership behavior with them.

### 6.2 Task

Task becomes the top-level personal monitoring object.

Changes:

- Remove `spaceId`
- Add `ownerId String @default("local-user")`
- Keep `title`
- Keep `taskType`
- Keep `userPrompt`
- Keep `relevanceLevel`
- Keep `summaryPreference`
- Keep `taskProfile`
- Index by `ownerId` and `createdAt`

The app is not versioned in production yet, so this can be a clean schema
change rather than a compatibility migration.

### 6.3 Ownership

Ownership is checked through Task:

- Task access checks `Task.ownerId`
- Source access checks `Source -> Task.ownerId`
- Brief access checks `Brief -> Task.ownerId`
- Item access checks `Item -> Source -> Task.ownerId`
- Recommendation access checks `RecommendationBundle -> Task.ownerId`

The old role system is replaced with owner-only access.

### 6.4 Chat

Supported chat scopes:

- `global`
- `task`
- `brief`

Remove `space` chat scope.

Keep actor-scoped chat IDs so that different users cannot share a thread
accidentally.

## 7. Primary User Flow

### 7.1 Create Monitoring Goal

The user starts from `/` and enters:

- Title
- Monitoring goal prompt

The creation form should default to topic monitoring. If task type remains
visible, it is a secondary advanced control.

On submit:

1. Create Task for the current user
2. Generate task intelligence
3. Redirect to `/tasks/[taskId]`

Do not redirect back to the dashboard after creation.

### 7.2 Generate Task Intelligence

The system extracts:

- Keywords
- Exclusion terms
- Suggested queries
- Language preference when inferable
- Recommended source types
- Recommended subscription packages
- Suggested sync frequency
- Suggested notification policy

Existing `RecommendationBundle` can continue to store recommended source
packages.

### 7.3 Recommend Subscription Packages

Show two or three package groups:

- Official sources: official sites, blogs, changelogs, release notes
- Community discussion: Hacker News, Reddit, Product Hunt, GitHub, similar
  community surfaces
- Search discovery: Bing, Hacker News search, Weibo, Bilibili, or other
  keyword-search style sources

The exact platforms can be introduced incrementally. The UI should present the
package type and rationale even if the first implementation only supports a
subset of candidates.

### 7.4 First Sync Preview

Before saving selected source candidates as formal subscriptions, run a light
preview.

The preview should show:

- Number of source candidates checked
- Number of candidate items found
- Items likely to produce briefs
- Items filtered out
- Filtering reasons
- Recommended monitoring frequency
- Suggested notification level

Preview must not create formal Source records.

### 7.5 Confirm Subscription

After the user confirms:

1. Create Source records for selected candidates
2. Store accepted preview items when they are suitable for immediate first
   briefs
3. Generate first Brief records from accepted items
4. Redirect to the task page with the generated briefs visible

Rejected preview items should not create briefs. The first implementation should
not persist rejected preview items; it should return them only in the preview
response so the user can understand what was filtered.

### 7.6 Advanced Custom Source

Keep an advanced path for manual source setup:

- RSS
- Page
- Structured list
- Update page
- Newsletter archive
- Telegram public
- Telegram bot

Custom sources should use the same preview and quality logic as recommended
sources.

Recommended sources and custom sources must both create the same Source model.
They differ only in how the source candidate is produced.

## 8. Subscription Preview Design

### 8.1 Source Candidate

A SourceCandidate is not persisted as a Source.

Fields:

- `title`
- `url`
- `sourceType`
- `packageTitle`
- `rationale`

### 8.2 Preview Item

A PreviewItem is the temporary result of fetching a SourceCandidate.

Fields:

- `title`
- `canonicalUrl`
- `summary`
- `publishedAt`
- `sourceCandidate`
- `qualityStatus`
- `relevanceScore`
- `relevanceReason`
- `keywordMentioned`
- `matchedTerms`
- heat metrics only when the source extractor provides them

### 8.3 Subscription Preview Result

The preview action returns:

- `sourceCount`
- `candidateItemCount`
- `acceptedItemCount`
- `rejectedItemCount`
- `acceptedItems`
- `rejectedItems`
- `rejectionReasons`
- `recommendedSyncIntervalMinutes`
- `recommendedNotificationLevel`

The first implementation can return this from a server action without a new
database table. If preview state needs to survive refreshes, add a
`SubscriptionPreview` table later.

## 9. Quality Gate

The quality gate is the minimum first phase of the later hotspot radar plan.

It decides whether a candidate item should produce a brief.

Outputs:

- `isReal`
- `relevanceScore`
- `relevanceReason`
- `keywordMentioned`
- `matchedTerms`
- `qualityStatus`
- `qualityError`

The internal score format should stay aligned with Inflowee's existing 0-1
scores. UI can display it as a percentage.

Initial soft filtering rules:

- `isReal === false` rejects the item
- `relevanceScore < 0.5` rejects the item
- `keywordMentioned === false && relevanceScore < 0.65` rejects the item
- AI failures fall back to local keyword matching and should not fail the whole
  source preview or sync

For confirmed subscriptions, accepted items can generate briefs. Rejected items
do not generate briefs.

## 10. Page Structure

### 10.1 Dashboard `/`

The dashboard becomes a personal workbench.

Show:

- Monitoring goals
- Unread brief count
- Recent briefs
- Source health
- Recent sync runs
- Create monitoring goal entry point

Do not show Space creation or Space structure.

### 10.2 Task Page `/tasks/[taskId]`

The task page becomes the monitoring goal control center.

Sections:

- Goal summary
- Task profile
- Recommended subscription tab
- Custom source tab
- First sync preview result
- Subscribed sources
- Recent briefs
- Task chat

### 10.3 Sources `/sources`

Sources becomes an advanced management and troubleshooting page.

It should still support:

- Viewing all personal sources
- Manual source creation
- Manual sync
- Schedule changes
- Failure inspection

It is no longer the default first-run path.

### 10.4 Inbox `/inbox`

Inbox remains the consumption surface.

Empty states must explain the real state:

- No monitoring goals: create a monitoring goal
- Goals exist but no subscriptions: choose recommended subscriptions
- Subscriptions exist but have not synced: run preview or sync
- Sync failed: inspect source failure
- Content was filtered: show filtering reasons
- Sources are healthy but no new content exists: explain that there are no new
  updates

## 11. Removed Routes

Remove:

- `/spaces/[spaceId]`
- `/spaces/[spaceId]/tasks/[taskId]`
- `/invite/[token]`

Replace task details with:

- `/tasks/[taskId]`

## 12. Error Handling

Preview and sync should be resilient.

- A single source candidate failure should not fail the whole preview
- A single item quality-analysis failure should not fail source sync
- Invalid AI JSON should fall back to local rules
- Source fetch failures should be visible in preview
- Empty successful fetches should be distinguished from failed fetches
- Rejected items must show a reason in preview

## 13. Testing

Unit and integration tests should cover:

- Creating a Task without a Space
- Listing personal Tasks by owner
- Task access by owner
- Source access through Task owner
- Brief access through Task owner
- Recommendation preview does not create Source records
- Confirmed subscription creates Source records
- Accepted preview items generate Brief records
- Rejected preview items do not generate Brief records
- Custom source preview reuses the same preview logic
- Inbox empty states select the right explanation
- Removed routes are no longer linked from navigation

Validation commands:

- `pnpm prisma generate`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## 14. Implementation Phases

### Phase 1: Personal Subscription Flow

- Remove Space, membership, and invite data model
- Make Task owner-scoped
- Replace Space routes with Task routes
- Build personal dashboard
- Build monitoring goal creation flow
- Build source recommendation and preview flow
- Confirm subscriptions into Source
- Generate first briefs after confirmation

### Phase 2: Hotspot Radar

Add broader discovery and quality features:

- Query expansion
- Search discovery sources
- Platform heat metrics
- Stronger fake/spam filtering
- Cross-source trend detection
- Search result freshness windows

This may become a separate spec:

`2026-05-24-hotspot-radar-quality-layer-design.md`

### Phase 3: Notifications

Add personal notification improvements:

- Per-task notification policy
- Important-only alerts
- Email digest
- Browser notifications
- Delivery health by task

## 15. Success Criteria

The redesign succeeds when:

- A personal user can create a monitoring goal without creating a Space
- The user can subscribe without manually entering a URL
- The user can preview subscription quality before confirming
- Confirmed subscriptions create normal Source records
- First briefs are generated immediately when accepted preview items exist
- Empty states explain what happened and what to do next
- The app no longer exposes Space, member, or invite concepts
