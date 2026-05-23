# Task Copilot Layer Design

- Date: 2026-05-24
- Project: Inflowee
- Scope: Task Copilot Layer

## 1. Purpose

Inflowee is no longer just a source reader or brief inbox. The current product
shape is a task-oriented intelligence workspace:

- `source ingest -> brief -> task chat -> recommendation wizard`

The next stage should push the system from information collection toward
judgment and action. This spec defines a `Task Copilot Layer` that sits on top
of the existing brief and task model.

This stage adds four capabilities:

1. `Brief Feedback Loop`
2. `Signal Alerts`
3. `Task Coverage Gap`
4. `Auto Actions from Briefs`

## 2. Non-Goals

This stage does **not** include:

- external alert delivery for task alerts
- free-form feedback comments
- automatic task creation or automatic source changes
- complex rule editors
- historical coverage trend charts
- model training / embeddings / online learning loops
- deeper auth/collaboration redesign

## 3. Product Positioning

The product center of gravity for this stage is the `task`, not the source and
not the raw brief list.

- `Brief` is the signal object.
- `Task Copilot` is the judgment and action surface.
- `Brief Detail` is the evidence and feedback surface.

The system should help the user answer:

1. What happened in this task?
2. What deserves attention now?
3. What should I do next?
4. How does the system get better from my judgment?

## 4. UX Approach

The chosen product direction is `Task Copilot Layer`, not `Brief Intelligence
Layer`.

That means:

- the `task page` becomes the main intelligence workspace
- the `brief detail page` remains the place for source evidence and feedback
- app-level alerts remain lightweight and route users back into the task

## 5. Core Surfaces

### 5.1 Task Page

The current task page becomes a `Task Copilot Workspace`.

It should contain:

1. `Signals Stream`
2. `Judgment Panels`
3. `Actions Panel`
4. `Grounded Chat`

### 5.2 Brief Detail Page

The brief detail page remains the single-signal deep dive surface and gains:

- five-value feedback controls
- single-brief action suggestions
- related evidence and source citations

### 5.3 App-Level Alerts

The app-level alerts surface is only a summary feed of tasks that need
attention. It should not become a second analysis workspace.

## 6. Task Copilot Information Architecture

The task workspace should be organized as:

### 6.1 Signals

Purpose: show what happened.

Contains:

- recent briefs for the task
- importance / relevance
- 5-15 topic tags
- source count
- current signal context

### 6.2 Judgment

Purpose: show what matters now and what monitoring is weak.

Contains:

- `Signal Alerts`
- `Task Coverage Gap`

### 6.3 Actions

Purpose: show what the user should do next.

Contains:

- `Auto Actions from Briefs`

### 6.4 Learning

Purpose: let the user teach the system.

Contains:

- `Brief Feedback Loop`

Learning is a core system capability, but its UI entry remains on brief detail
for the first version.

## 7. Capability Design

### 7.1 Brief Feedback Loop

#### Entry point

Only on `brief detail` in the first version.

#### Feedback options

Fixed values only:

- `有用`
- `无用`
- `误报`
- `太泛`
- `太晚了`

#### Behavior

The first version should use explicit, explainable feedback propagation rather
than hidden online learning.

Feedback must influence:

- ranking
- source recommendation
- summary style

#### Intended effects

- `有用`: boost similar sources, tags, domains, and comparable brief patterns
- `无用`: lower similar source and tag priority within the task
- `误报`: more aggressively penalize mismatched source/tag/topic patterns
- `太泛`: bias future summaries to be shorter and more focused
- `太晚了`: bias future signals toward timelier sources and high-velocity events

### 7.2 Signal Alerts

#### Entry points

- task workspace alerts panel
- app-level alerts summary

#### First-version triggers

Two trigger classes:

1. Structured thresholds
2. Event templates

Structured thresholds:

- `importanceScore >= threshold`
- matching key tags
- first appearance of a tracked keyword

Event templates:

- new hiring signal
- product or docs update signal
- financing or launch signal

#### First-version constraints

- alerts are in-app only
- no external push for this capability yet
- no complex rule-builder UI

### 7.3 Task Coverage Gap

#### Entry point

Task workspace coverage panel.

#### First-version focus

Only detect over-concentration, not full monitoring quality scoring.

The system should detect:

- domain over-concentration
- source type over-concentration
- tag cluster over-concentration

#### Output style

The output should be actionable diagnosis, not abstract scoring.

Examples:

- this task is overly dependent on one domain
- this task is missing official sources
- this task is biased toward one signal family

Coverage warnings must include suggestions for what type of source to add.

### 7.4 Auto Actions from Briefs

#### Entry points

- brief detail
- task workspace
- alerts region

#### First-version action types

- add to an existing task
- suggest creating a new task
- suggest a follow-up / deeper question

#### Output form

Structured action cards, not free-form text blobs.

#### Constraints

- suggestions only
- no auto-execution
- no automatic task creation
- no automatic source edits
- user confirmation required for all actions

## 8. Data Model Additions

The implementation should be incremental. Existing core objects remain intact.

### 8.1 New `BriefFeedback`

Fields:

- `briefId`
- `taskId`
- `actorId`
- `feedbackType`
- `createdAt`

`feedbackType` values:

- `useful`
- `not_useful`
- `false_positive`
- `too_broad`
- `too_late`

Rationale:

Feedback must be stored as a first-class fact instead of being collapsed into
mutated scores only.

### 8.2 New `TaskAlert`

Fields:

- `taskId`
- `briefId`
- `alertType`
- `reason`
- `status`
- `createdAt`

`status` values:

- `open`
- `dismissed`

Rationale:

Task alerts are judgment outputs, not delivery logs.

### 8.3 `TaskCoverageSnapshot`

The first version does not require a historical database table.

It can be implemented as runtime computation with optional caching and should
return:

- `topDomains`
- `topSourceTypes`
- `topTagClusters`
- `warnings`

### 8.4 New `TaskActionSuggestion`

Fields:

- `taskId`
- `briefId?`
- `actionType`
- `title`
- `reason`
- `payload`
- `status`
- `createdAt`

`status` values:

- `open`
- `accepted`
- `dismissed`

Rationale:

Action suggestions need persistence so users can revisit and triage them.

### 8.5 Minimal `Task` Extension

`Task` may gain small copilot config fields such as:

- alert threshold
- tracked priority tags

The first version must avoid turning task config into a full rule editor.

## 9. First-Version UX Boundaries

### Must ship

- feedback persistence
- task alert persistence
- task action suggestion persistence
- coverage diagnosis computation
- task page workspace upgrade

### Must not ship yet

- feedback free-text notes
- external task alert notifications
- automatic action execution
- coverage history visualization
- complex charts
- implicit learning systems with opaque effects

## 10. Data Flow

The intended product loop is:

`brief signal -> task judgment -> action suggestion -> user feedback -> system learning`

Operationally:

1. Source ingestion creates briefs
2. Briefs are evaluated for alert triggers
3. Task workspace computes current coverage diagnosis
4. Task workspace or brief detail surfaces action suggestions
5. User gives feedback on selected briefs
6. Feedback updates ranking, recommendation, and summary behavior

## 11. Testing Strategy

### 11.1 Unit tests

Add focused unit coverage for:

- `BriefFeedback` persistence and update rules
- `SignalAlerts` trigger logic
- `TaskCoverageGap` concentration detection
- `TaskActionSuggestion` generation logic

### 11.2 Integration tests

Validate:

- `source ingest -> brief -> task alert`
- `brief detail feedback -> ranking/recommendation inputs`
- task workspace panels render consistent state from shared data

### 11.3 Page-level verification

Validate:

- task page acts as the main workspace
- brief detail shows feedback controls
- alerts summary routes correctly back to task workspace

## 12. Risks and Mitigations

### Risk 1: Feedback has no visible effect

If feedback is stored but users cannot perceive changes, the loop feels fake.

Mitigation:

- first version must visibly affect ranking, recommendation, and summary behavior

### Risk 2: Alerts become noisy

If thresholds are too permissive, the alerts layer becomes a second inbox.

Mitigation:

- keep triggers small in number
- default to conservative alert generation

### Risk 3: Coverage diagnosis is non-actionable

If the panel only says coverage is weak, it does not help users improve the
task.

Mitigation:

- every warning must include a recommended source-type or signal-family gap

### Risk 4: Action suggestions are vague

If suggestions are generic, they add clutter instead of leverage.

Mitigation:

- restrict the first version to three structured action classes only

## 13. Incremental Delivery Plan Shape

The implementation should be split into four slices:

### Slice 1: Brief Feedback Loop

- feedback controls on brief detail
- feedback persistence
- basic propagation into ranking/recommendation/summary preferences

### Slice 2: Task Alerts

- alert generation
- app-level alert summary
- task workspace alerts panel

### Slice 3: Coverage Gap

- concentration diagnosis
- task workspace coverage panel
- recommendation guidance based on gaps

### Slice 4: Action Suggestions

- structured action cards in brief detail, task workspace, and alerts
- suggestion persistence
- accept / dismiss states

## 14. Success Criteria

This stage is successful when:

1. the task page clearly functions as a judgment and action workspace
2. users can provide five-value feedback on a brief
3. alerts can be generated in-app from stored signals
4. coverage concentration is surfaced with actionable guidance
5. action suggestions are visible and triageable without auto-executing changes

