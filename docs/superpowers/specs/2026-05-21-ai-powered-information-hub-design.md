# AI-Powered Information Hub Design

Date: 2026-05-21
Status: Draft approved in conversation, pending user review of written spec

## 1. Goal

Build an AI-enhanced feed reader for heavy individual information consumers. The
product should help users discover sources, subscribe to them, ingest updates
from heterogeneous public web sources, filter and summarize them with AI, and
present the resulting intelligence in multiple formats.

This is not a pure RSS reader and not a fully autonomous research agent. The
first version is a feed-centric product with strong AI augmentation.

## 2. Product Positioning

Primary target user:

- Individual heavy information consumers such as researchers, investors,
  product managers, and developers

Core value proposition:

- Discover better sources with AI
- Turn noisy updates into an intelligence feed
- Preserve source transparency and controllability
- Support multiple output formats from the same canonical intelligence object

Chosen product direction:

- Feed Reader upgraded with strong AI capabilities

Chosen information architecture:

- Dual-layer view
- Top layer: AI Brief Inbox
- Lower layer: raw sources and raw items

This keeps the product understandable like a reader while making AI the main
consumption path.

## 3. MVP Scope

The MVP covers this closed loop:

1. User creates a space
2. User creates a task inside the space
3. Task can be either topic-driven or question-driven
4. AI recommends bundles of sources
5. User confirms concrete sources to subscribe
6. System ingests updates from subscribed sources
7. AI filters, ranks, deduplicates, and summarizes ingested items
8. User consumes AI briefs in the web app
9. User can ask follow-up questions in chat
10. Same brief can be rendered as web, HTML, or image output

## 4. Out of Scope for MVP

- Real mailbox-based newsletter subscription and parsing
- Social media API integrations
- Team collaboration and multi-user workflows
- Complex user-authored rule engine
- Executing multi-channel delivery workflows
- Rich image editor or long-form poster composer

Notes:

- Delivery to external channels is not part of MVP execution, but the data model
  and rendering layer should leave room for it later.
- Project-oriented delivery is a future stage, not part of the first version.

## 5. Core Domain Model

### 5.1 Space

Top-level container for a long-lived intelligence context.

Examples:

- AI Coding Agents
- OpenAI Monitor
- Investment Watch

Fields:

- name
- description
- tags

### 5.2 Task

Unit of user intent within a space.

Task types:

- Topic subscription
- Question tracking

Both types should be normalized into a shared task profile used by source
recommendation and AI processing.

Fields:

- space_id
- task_type
- user_prompt
- task_profile
- relevance_threshold
- summary_length
- dedupe_strength
- update_frequency

### 5.3 Source

Concrete subscribed input endpoint.

Source types in MVP:

- RSSSource
- PageSource
- StructuredListSource
- UpdateSource
- NewsletterArchiveSource

Fields:

- task_id
- source_type
- url
- crawl_strategy
- extraction_config
- status
- last_success_at
- last_error

### 5.4 Bundle

AI-generated recommendation package shown before subscription confirmation.

Purpose:

- Present sources as a meaningful group instead of a flat link dump
- Explain why the group is useful
- Let user expand and select concrete sources

Fields:

- task_id
- title
- rationale
- candidate_sources

### 5.5 Item

Raw ingested content unit produced by source fetching and extraction.

Fields:

- source_id
- source_type
- canonical_url
- raw_content
- structured_fields
- published_at
- fetched_at
- content_hash
- language

### 5.6 Brief

Canonical AI-processed intelligence object used for end-user consumption.

Fields:

- task_id
- item_ids
- dedupe_cluster_id
- relevance_score
- importance_score
- title
- summary
- why_it_matters
- source_citations
- tags
- follow_up_context

### 5.7 ChatThread

Conversation context anchored to one scope.

Scopes:

- global
- space
- task
- brief

Fields:

- scope_type
- scope_id
- messages
- referenced_briefs

## 6. Source Model

### 6.1 RSSSource

Standard RSS or Atom feed ingestion.

Use cases:

- Blogs
- News sites
- Official announcements

### 6.2 PageSource

General web page or content listing page when RSS is unavailable.

Use cases:

- Product blogs without feeds
- Documentation sections
- Public update pages

### 6.3 StructuredListSource

Structured list-like pages where each page contains multiple meaningful entries.

Use cases:

- Job boards such as remotejobscn.com
- Rankings
- Product listings
- Curated aggregators

This source type must support extracted fields such as:

- title
- company
- location
- published_at
- url
- tags

The MVP should support user-visible field definitions, with extraction powered by
the system rather than requiring raw CSS/XPath expertise from users.

### 6.4 UpdateSource

Persistent update-oriented source for non-feed update pages.

Use cases:

- Changelog pages
- Release notes
- Documentation updates
- Public product update pages

### 6.5 NewsletterArchiveSource

Publicly accessible newsletter archive or post archive page.

MVP boundary:

- Support only public archive URLs or public links
- Do not support mailbox subscription or inbound email ingestion

## 7. User Experience Model

### 7.1 Primary Screens

The MVP should include five primary screens:

- Inbox
- Space
- Task
- Source Management
- Chat

### 7.2 Inbox

Main consumption surface.

Shows AI-processed brief stream with filtering such as:

- unread
- important
- by tag
- by task

This screen should prioritize briefs over raw items.

### 7.3 Space Page

Shows:

- space overview
- task list
- recent briefs
- chat entry point

### 7.4 Task Page

Shows:

- task prompt and type
- AI recommendation bundles
- confirmed sources
- recent briefs
- AI control knobs

### 7.5 Source Management

Shows:

- subscribed sources
- source types
- crawl status
- extraction status
- recent errors

### 7.6 Chat

Chat can be a dedicated page or a contextual drawer.

User can ask questions against:

- a space
- a task
- a brief

## 8. Core User Flow

1. Create space
2. Create task inside the space
3. Choose topic-driven or question-driven entry
4. Enter prompt
5. Receive AI-generated bundles of source recommendations
6. Expand bundles and select concrete sources
7. Start ingestion
8. Produce raw items
9. Transform raw items into briefs
10. Consume briefs in inbox
11. Ask follow-up questions in chat
12. Render selected briefs as HTML or image when needed

## 9. AI Processing Pipeline

The MVP AI layer should have exactly four stages.

### 9.1 Intent Understanding

Input:

- user task prompt

Output:

- normalized task profile

The profile should capture:

- tracked entities
- keywords
- topical focus
- time sensitivity
- preferred content types
- noise exclusions

### 9.2 Source Recommendation

Input:

- normalized task profile

Output:

- one or more bundles with candidate sources and rationale

Important UX rule:

- User confirms concrete sources before subscription becomes active

### 9.3 Item Enrichment

Input:

- raw fetched content

Output:

- normalized item object

Responsibilities:

- title extraction
- time extraction
- author or origin extraction when available
- content extraction
- structured field extraction
- canonical URL normalization
- language detection

### 9.4 Brief Generation

Input:

- normalized items in task context

Output:

- canonical briefs

Responsibilities:

- relevance filtering
- importance ranking
- deduplication and clustering
- summary generation
- why-it-matters generation
- source citation assembly
- tag generation

## 10. AI Control Surface

The MVP should keep user controls narrow.

Users can tune:

- relevance threshold
- summary length
- dedupe strength
- update frequency

The MVP should not expose a general-purpose rule engine.

## 11. Brief Design

The default brief card should contain:

- title
- AI summary
- why it matters
- deduplicated related sources
- source citations
- tags
- entry point for follow-up questions

The brief is the main browsing object. Raw items remain accessible for
verification and source trust.

## 12. Chat Boundary

Chat behavior for MVP:

- Answer primarily from ingested and stored content
- Allow limited ad hoc fetching of a small number of public web pages when
  stored context is insufficient

Response transparency requirement:

- Clearly distinguish between knowledge grounded in stored briefs or items and
  knowledge added via temporary live fetching

The MVP is not a full autonomous web research agent.

## 13. Rendering and Output Layer

Rendering must be separated from ingestion and intelligence generation.

Pipeline:

- Source -> Item -> Brief -> Render Output

This separation is required so the system can support multiple delivery and
presentation forms later without contaminating upstream processing logic.

### 13.1 Canonical Brief

Single internal representation of intelligence output.

### 13.2 Render Output

Presentation-specific rendering derived from canonical brief data.

The MVP should support three output targets:

- Web Brief Card
- HTML Digest
- Image Card

### 13.3 Web Brief Card

Primary in-app output.

### 13.4 HTML Digest

Use cases:

- daily or weekly digests
- share pages
- archive pages
- future webhook payload rendering

Implementation rule:

- Use deterministic templates
- Do not rely on free-form AI-generated full-page HTML

### 13.5 Image Card

Use case:

- shareable static image for a single brief

MVP boundary:

- Static brief-card rendering only
- No advanced poster editor
- No long-image editor

Suggested content:

- title
- summary
- why it matters
- source count
- one or two citation points
- tags

## 14. Failure Handling

The MVP should explicitly handle these failure modes.

### 14.1 Crawl Failure

- keep source status visible
- store latest error
- allow retry

### 14.2 Extraction Failure

For structured or update-like sources:

- fall back to whole-page extraction plus coarse AI interpretation when possible

### 14.3 Deduplication Error

- allow user to inspect linked raw items behind a brief

### 14.4 AI Judgment Drift

- expose the small set of AI control knobs

### 14.5 Chat Live-Fetch Failure

- clearly state that live supplementation failed or was unavailable
- do not imply completeness

## 15. Verification Goals

The MVP should be considered technically viable only if it can demonstrate:

- one task producing stable briefs from at least three different source types
- one event reported by multiple sources merged into one brief with citations
- one structured list source with stable extracted fields
- one newsletter archive treated as a recurring update source rather than a
  one-time import
- chat answers citing stored content and distinguishing temporary live-fetched
  content

## 16. Future Expansion Paths

Not for MVP implementation, but the design should leave room for:

- mailbox-based newsletter ingestion
- external channel delivery and webhook execution
- project-oriented intelligence delivery
- team collaboration
- social API integrations
- richer reporting and visual outputs

## 17. Key Design Decisions Summary

- Product direction: feed reader upgraded with strong AI
- Primary target: individual heavy information consumers
- Information architecture: dual-layer, AI brief inbox over raw source layer
- Top-level structure: spaces with tasks, plus tags for cross-cutting filtering
- Task model: topic-driven and question-driven are first-class and parallel
- Source model: five public-web source types
- AI control model: AI-first with a small set of user knobs
- Chat model: stored-content-first with limited live fetch fallback
- Output model: web, HTML, and static image based on canonical briefs

