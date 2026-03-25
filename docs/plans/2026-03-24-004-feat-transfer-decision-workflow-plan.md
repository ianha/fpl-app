---
title: "feat: Best Transfer Decision Workflow Before Deadline"
type: feat
status: active
date: 2026-03-24
origin: research/last30days + docs/plans/2026-03-23-001-feat-fpl-clone-features-integration-plan.md + docs/plans/2026-03-23-002-feat-ai-transfer-recommendations-price-predictor-plan.md
---

# feat: Best Transfer Decision Workflow Before Deadline

## Overview

This plan defines a concrete product spec and ranked roadmap for the highest-value pre-deadline workflow in FPLytics: helping a manager decide whether to roll, make a free transfer, or take a hit before each gameweek deadline.

The product should not behave like a generic optimizer or a passive stats dashboard. It should act like a decision workspace anchored in the manager's real squad, real bank, real free transfers, and upcoming fixtures, then narrow the problem into a small set of clear actions:

1. Roll the transfer
2. Make the best 1FT move
3. Make the best 2FT move
4. Take a selective hit only when the projected gain justifies it

Recent market and community research strongly support this direction. The clearest recurring demand is for:
- multi-GW planning
- projected points gain over a horizon, not just next GW
- fixture context beside the planner
- correct budget / selling value / hit logic
- chip-aware planning

Those patterns line up well with FPLytics' existing data foundation and current My Team architecture.

---

## Problem Statement

Managers usually do not need more raw data before deadline. They need a trusted answer to a narrower question:

`What should I do with my transfer this week, and why is that better than my main alternatives?`

Current tools often fail in one of two ways:
- they expose plenty of stats but leave the manager to do the mental synthesis
- they produce opaque transfer suggestions without showing the tradeoffs versus rolling, holding, or waiting one more week

FPLytics already has several prerequisite building blocks:
- linked My Team data
- xPts and FDR data in the API layer
- captain recommendation patterns
- a growing My Team page as the manager's command center

The missing piece is a deadline-focused workflow that turns those inputs into a comparison between realistic transfer paths.

---

## Product Goal

Build the best transfer decision workflow before deadline by making FPLytics the fastest place for a manager to answer:

- Should I roll or use my transfer?
- Which move is best this GW?
- Is a `-4` actually worth it?
- Which option is best over the next `3-5` GWs, not just tomorrow?
- How does this move affect money, flexibility, and future plans?

Success means the manager can open My Team, see the deadline decision workspace, compare the best options, understand the reasoning, and act with confidence in under two minutes.

---

## Product Spec

## Primary User Story

As an active FPL manager approaching the deadline, I want to compare my best realistic transfer options against rolling so I can make the highest-value move for the next few gameweeks.

## Core Jobs To Be Done

1. Understand whether there is a transfer worth making at all.
2. Compare a few realistic options instead of scanning the whole player pool.
3. See projected gain over a selected horizon such as `1`, `3`, or `5` GWs.
4. Account for bank, free transfers, hits, and selling value correctly.
5. Understand the reasoning behind the recommendation in plain language.
6. Optionally extend the analysis into chip or wildcard planning later.

## Non-Goals For V1

- full automatic optimizer across every legal squad combination
- wildcard solver
- live price prediction as a dependency for launch
- AI-only recommendations without a deterministic scoring layer
- social/community recommendation features

## Product Surface

The feature should live primarily in [MyTeamPage.tsx](/Users/iha/fplytics/apps/web/src/pages/MyTeamPage.tsx) as a dedicated `Transfer Decision` workspace, not as a buried subpage.

Secondary surfaces can follow later:
- AI chat tool integration
- Players page / player detail cross-links
- saved planning views

## UX Flow

### Entry

On My Team, above or near the transfer history / squad context, the user sees a `Transfer Decision` card for the current gameweek.

### Inputs

The workspace preloads:
- current squad
- current bank
- free transfers
- selected gameweek
- horizon selector: `1 GW`, `3 GWs`, `5 GWs`

Optional user controls:
- include hit options on/off
- max hit allowed: `0`, `-4`, `-8`
- risk posture: `safe`, `balanced`, `upside`
- chip context: `none` initially, extensible later

### Output

The workspace returns a ranked set of `Decision Options`:

1. `Roll`
2. `Best 1FT`
3. `Best 2FT` if available
4. `Best hit` if it beats the configured threshold

Each option shows:
- players out / in
- projected points gain over the selected horizon
- hit cost
- remaining bank
- short reason summary
- confidence / caution flags

### Decision Detail

Clicking an option opens a breakdown:
- next `1-5` GW projection by player out vs player in
- fixture quality summary
- availability / minutes risk
- budget effect
- what the manager is giving up by not rolling or not choosing the top alternative

## Core Decision Objects

### Decision Option

The main product entity is not "a recommended player". It is "a realistic transfer path."

Example:

`Sell Rogers -> Buy Saka`

with attached fields:
- transfer count
- hit cost
- projected net gain by horizon
- remaining bank
- next-GW impact
- medium-term impact
- explanation
- warnings

### Baseline Option

Every comparison set must include `Roll` as a first-class baseline. This is essential because the hardest real decision before deadline is often whether to do nothing.

### Comparison Set

The UI should usually show `3-5` options total, not a long ranked table. The product is a decision workflow, not a player discovery engine.

---

## Decision Engine Spec

## Inputs

Use existing and planned internal data sources:
- `getMyTeam()` and related account/gameweek data from [queryService.ts](/Users/iha/fplytics/apps/api/src/services/queryService.ts)
- xPts model from [queryService.ts](/Users/iha/fplytics/apps/api/src/services/queryService.ts)
- fixture/FDR data from [queryService.ts](/Users/iha/fplytics/apps/api/src/services/queryService.ts)
- squad and transfer contracts in [index.ts](/Users/iha/fplytics/packages/contracts/src/index.ts)
- web client access patterns in [client.ts](/Users/iha/fplytics/apps/web/src/api/client.ts)

V1 input model:
- current squad and formation constraints
- free transfers
- bank
- gameweek horizon
- player xPts for selected horizon
- fixture difficulty for selected horizon
- availability/news penalty

V1.1 additions:
- selling value correctness per owned player
- price movement urgency signal
- ownership/template context

V2 additions:
- chip state
- wildcard/future transfer reservation logic

## Scoring Model

Use a deterministic decision engine first. LLM explanation can be layered on later, but the ranking itself should be reproducible and testable.

For each candidate path:

`decision_score = projected_gain - hit_cost_adjustment - risk_penalty + fixture_fit + flexibility_bonus`

Recommended V1 scoring components:
- projected xPts gain over user-selected horizon
- next-GW weight boost so immediate deadline impact matters
- hit penalty
- minutes/injury penalty
- fixture difficulty adjustment
- bank preservation bonus for near-tied choices

Recommended default horizon weighting:
- `1 GW mode`: 100% GW+1
- `3 GW mode`: 55% GW+1, 30% GW+2, 15% GW+3
- `5 GW mode`: decaying weights front-loaded toward the next two deadlines

## Candidate Generation

Avoid trying to solve the entire FPL search space in V1.

Generate candidate options by:
1. identifying weak links in the current squad by horizon-adjusted score
2. finding affordable same-position replacements
3. generating the strongest `1FT` moves
4. generating valid `2FT` combinations when the manager has 2+ free transfers
5. generating limited `-4` options only if enabled

This keeps the system fast, understandable, and easy to test.

## Explanation Layer

Every surfaced option should include deterministic explanation bullets such as:
- `+7.4 xPts over 3 GWs`
- `better fixtures from GW32-GW34`
- `avoids benching issue next week`
- `not worth a -4 unless you want immediate captaincy upside`

If AI narration is added later, it should explain the already-ranked options, not invent the ranking.

---

## UI Spec

## Transfer Decision Workspace

Add a new section to [MyTeamPage.tsx](/Users/iha/fplytics/apps/web/src/pages/MyTeamPage.tsx):

`Transfer Decision`

Recommended structure:

1. Header row
   - title
   - active gameweek
   - deadline context
2. Control row
   - horizon selector
   - include hits toggle
   - max hit selector
3. Summary strip
   - bank
   - free transfers
   - top recommendation
   - roll recommendation state
4. Decision cards
   - roll
   - best 1FT
   - best 2FT
   - best hit
5. Expanded breakdown panel

## Decision Card Content

Each card should show:
- label: `Roll`, `Best 1FT`, `Best 2FT`, `Best -4`
- projected gain
- short transfer string
- remaining bank
- confidence tag such as `Strong`, `Close call`, `Aggressive`
- one-line explanation

## Empty / Guard States

- if no linked team: show current connect-team CTA pattern
- if xPts not loaded: show existing async loading pattern
- if no transfer beats roll: make `Roll` the highlighted recommendation
- if recommendations are too close: label as close call instead of overclaiming precision

## Mobile Behaviour

The decision cards should stack vertically and keep the top recommendation visible first. Avoid wide tables on mobile.

---

## API / Contracts Spec

## New Contract Types

Add to [index.ts](/Users/iha/fplytics/packages/contracts/src/index.ts):

- `TransferDecisionRequest`
- `TransferDecisionOption`
- `TransferDecisionComparison`
- `TransferDecisionResponse`

Recommended shape:

```ts
interface TransferDecisionOption {
  id: string;
  label: "roll" | "best_1ft" | "best_2ft" | "best_hit";
  transfers: Array<{
    outPlayerId: number;
    outPlayerName: string;
    inPlayerId: number;
    inPlayerName: string;
    position: string;
    priceDelta: number;
  }>;
  horizon: 1 | 3 | 5;
  projectedGain: number;
  nextGwGain: number;
  hitCost: number;
  remainingBank: number;
  confidence: "strong" | "medium" | "close_call" | "aggressive";
  reasons: string[];
  warnings: string[];
}

interface TransferDecisionResponse {
  gameweek: number;
  freeTransfers: number;
  bank: number;
  horizon: 1 | 3 | 5;
  recommendedOptionId: string;
  options: TransferDecisionOption[];
}
```

## New API Endpoint

Add a dedicated endpoint in [createApiRouter.ts](/Users/iha/fplytics/apps/api/src/routes/createApiRouter.ts):

`GET /api/my-team/:accountId/transfer-decision`

Query params:
- `gw`
- `horizon`
- `includeHits`
- `maxHit`

This should return pre-ranked options for the current manager and current gameweek.

## Frontend Client

Add a client helper in [client.ts](/Users/iha/fplytics/apps/web/src/api/client.ts) to fetch transfer decision data, parallel to existing My Team and captain recommendation helpers.

---

## Ranked Feature Roadmap

The roadmap below ranks features by:
- user value before deadline
- strategic differentiation
- dependency fit with the current repo
- speed to ship a trustworthy first version

## Tier 1: Must Ship First

### 1. Transfer Decision Workspace on My Team

Why first:
- highest user visibility
- aligns with the manager's actual weekly job
- uses existing My Team patterns and contracts

Scope:
- workspace shell
- horizon selector
- roll vs best transfer comparison cards

Success:
- user can compare `Roll` vs `Best 1FT` in one view

### 2. Deterministic Transfer Decision Engine

Why first:
- core product truth source
- required before AI explanations, chips, or advanced planning

Scope:
- candidate generation
- horizon-weighted projected gain
- hit logic
- basic warnings and confidence

Success:
- options are stable, explainable, and testable

### 3. Best 1FT / 2FT / Hit Comparison Set

Why first:
- users need alternatives, not a single recommendation
- this is the minimum workflow that beats passive dashboards

Scope:
- always include `Roll`
- surface `Best 1FT`
- add `Best 2FT` when relevant
- only show hit option if it clears a meaningful threshold

Success:
- user sees a small, decision-ready set of options

## Tier 2: High-Value Follow-Ons

### 4. Selling Value and Budget-Correct Planning

Why next:
- trust breaks quickly if the planner uses fake economics
- important for experienced managers

Scope:
- per-player selling value
- exact bank after move
- transfer validity enforcement

Success:
- recommendations always match what can be executed in official FPL

### 5. Fixture Run and Reason Breakdown

Why next:
- improves user trust and comprehension
- turns "black box" suggestions into a real assistant

Scope:
- fixture swing explanation
- next `3-5` GW player-by-player comparison
- explicit why-not-roll reasoning

Success:
- user can explain the recommendation back in plain English

### 6. Template / Ownership Context

Why next:
- differentiates safe vs aggressive moves
- helps users understand whether a move is protection or upside

Scope:
- ownership bands
- differential labeling
- optional risk posture weighting

Success:
- planner adapts to conservative vs upside-seeking decisions

## Tier 3: Strategic Expansion

### 7. Chip-Aware Planning

Why later:
- high value, but materially increases state complexity

Scope:
- free hit / wildcard / bench boost aware decisioning
- short-term chip conflict warnings

Success:
- planner avoids recommending moves that conflict with known chip plans

### 8. Price Movement Urgency Layer

Why later:
- useful edge, but not required for a trustworthy first release

Scope:
- rise/fall pressure input to tie-break close calls
- urgency badges on affected recommendations

Success:
- planner can say "buy now if you care about team value"

### 9. AI Explanation and Conversational Follow-Up

Why later:
- good wrapper, but should not replace deterministic ranking

Scope:
- ask "why this over rolling?"
- ask "what if I want to captain the incoming player?"
- export planner output into AI chat

Success:
- user can drill deeper without losing trust in the base ranking

## Tier 4: Advanced Product Depth

### 10. Multi-Week Saved Plans

Scope:
- save current path
- compare multiple future plans
- revisit after pressers or price changes

### 11. Deadline Monitoring and Alerting

Scope:
- "your best move changed"
- injury/news invalidated previous recommendation
- price rise threat warning

### 12. Wildcard / Full Solver Workspace

Scope:
- separate planning mode
- broader squad search
- distinct from the weekly decision workflow

---

## Recommended Delivery Sequence

Each phase below is intentionally scoped as the smallest complete deliverable that still gives a manager meaningful pre-deadline value. No phase should ship as a partial internal milestone that still leaves the user unable to make a decision.

## Phase 1: Should I Roll or Make One Transfer?

User value:
- Gives the manager a clear answer to the most common weekly question.
- Immediately beats a passive stats view by turning My Team into a decision screen.

Ship:
- `Transfer Decision` card on My Team
- deterministic comparison between `Roll` and `Best 1FT`
- horizon selector with `1 GW` and `3 GWs`
- projected gain, remaining bank, and short explanation
- endpoint, contracts, and tests needed to support this slice

Do not include yet:
- 2FT paths
- hit options
- chip logic
- ownership context

Why this phase is meaningful:
- Even by itself, it helps the majority of weekly decisions.
- A user can open the page and leave with an actual recommendation.

## Phase 2: Full Weekly Transfer Choice Set

User value:
- Expands the tool from a basic recommendation into a real transfer planner for normal weekly play.
- Covers the next most common situation: deciding between rolling, using 1FT, using 2FT, or taking a small hit.

Ship:
- `Best 2FT` when the manager has 2+ free transfers
- optional `Best -4` comparison when enabled
- hit toggle and max hit selector
- better option ranking labels such as `Strong`, `Close call`, `Aggressive`
- expanded option detail view

Do not include yet:
- ownership/template context
- chip-aware logic
- saved plans

Why this phase is meaningful:
- The user now gets a complete weekly decision set, not just a single recommendation.
- This is the first point where FPLytics can credibly say it helps choose between the main real-world transfer paths before deadline.

## Phase 3: Trustworthy Execution Layer

User value:
- Makes recommendations feel executable and reliable, not just interesting.
- Reduces the risk that the user sees a great move that is not actually affordable or realistic.

Ship:
- selling value correctness
- exact bank-after-move logic
- stronger validity checks
- richer reason breakdowns
- warning states for injuries, minutes risk, and near-tied options
- polished mobile layout for the decision workspace

Why this phase is meaningful:
- The product becomes trustworthy enough to act on without double-checking elsewhere.
- This is where the workflow shifts from "good idea generator" to "serious pre-deadline tool."

## Phase 4: Strategic Context

User value:
- Helps the manager choose not only the highest-projected move, but the right kind of move for their rank goals and appetite for risk.

Ship:
- ownership/template context
- differential tagging
- optional risk posture selector: `safe`, `balanced`, `upside`
- price urgency as a tie-breaker or recommendation badge

Why this phase is meaningful:
- Users can finally distinguish between safe protection moves and aggressive upside moves inside the same workflow.
- This is a meaningful differentiator from simpler planners.

## Phase 5: Planner Depth and Stickiness

User value:
- Turns the weekly decision tool into a repeat-use planning product managers return to throughout the week.

Ship:
- saved comparison plans
- alerting when the top recommendation changes
- AI explanation / conversational follow-up tied to the ranked options

Why this phase is meaningful:
- The planner becomes part of the manager's weekly routine rather than a one-time lookup.

## Phase 6: Advanced Planning Modes

User value:
- Serves more advanced managers planning around chips and longer horizons.

Ship:
- chip-aware planning
- future reservation logic for near-term chip plans
- wildcard / deeper squad-planning mode

Why this phase is meaningful:
- This phase opens a second product tier for advanced users, but only after the core weekly workflow is already strong.

---

## Repo-Grounded Implementation Units

## Unit 1: Contracts and API surface

Files:
- [index.ts](/Users/iha/fplytics/packages/contracts/src/index.ts)
- [createApiRouter.ts](/Users/iha/fplytics/apps/api/src/routes/createApiRouter.ts)
- [client.ts](/Users/iha/fplytics/apps/web/src/api/client.ts)

Deliver:
- request/response contracts
- transfer decision endpoint
- typed client helper

## Unit 2: Decision engine in API service layer

Files:
- [queryService.ts](/Users/iha/fplytics/apps/api/src/services/queryService.ts)

Deliver:
- candidate generation
- horizon scoring
- roll baseline
- hit gating
- reason and warning generation

## Unit 3: My Team transfer decision workspace

Files:
- [MyTeamPage.tsx](/Users/iha/fplytics/apps/web/src/pages/MyTeamPage.tsx)

Optional support files if extraction is needed:
- `apps/web/src/components/my-team/TransferDecisionCard.tsx`
- `apps/web/src/components/my-team/TransferDecisionControls.tsx`

Deliver:
- decision workspace UI
- controls
- decision cards
- expanded comparison details

## Unit 4: Verification

Files:
- API service tests
- route tests
- [MyTeamPage.test.tsx](/Users/iha/fplytics/apps/web/src/pages/MyTeamPage.test.tsx)

Deliver:
- ranking correctness tests
- guard state coverage
- mobile/desktop rendering coverage for the new workspace

---

## Risks and Mitigations

## Risk: Recommendation quality feels arbitrary

Mitigation:
- keep scoring deterministic
- expose clear reasons
- always compare against `Roll`

## Risk: Search space becomes too large

Mitigation:
- limit candidate generation to weak-link outs and high-fit replacements
- avoid full solver ambitions in V1

## Risk: Users over-trust tiny xPts deltas

Mitigation:
- add close-call labeling
- de-emphasize precise decimals in near-tied options
- surface caution text when gaps are small

## Risk: Planner recommends illegal or unrealistic moves

Mitigation:
- implement selling value and bank correctness early in Phase B
- cover transfer validity in tests

## Risk: UI becomes too dense on mobile

Mitigation:
- use stacked decision cards
- progressive disclosure for deep breakdowns
- keep the default view to top `3-4` options

---

## Verification Strategy

## Product Verification

- compare user flow against core jobs to be done
- confirm manager can answer roll vs transfer in under two minutes
- confirm `Roll` is shown whenever it is the correct answer

## Technical Verification

- unit-test scoring and candidate generation
- test exact bank / transfer count / hit handling
- route-test endpoint request variations
- UI-test horizon switching, option rendering, and empty states

## Quality Bar

The first shipped version is successful if:
- it gives a believable answer on My Team
- it explains why
- it handles the most common pre-deadline choices correctly
- it does not require the user to understand the underlying model to trust the output

---

## Minimum Meaningful Deliverable Principle

Every delivery phase for this product should satisfy all of the following:

- A manager can use it to make a better decision before the next deadline.
- The UI is understandable without needing future phases to make sense of it.
- The recommendation quality is high enough that the user does not feel misled.
- The phase is scoped around a complete user outcome, not a backend milestone.

In practice, this means we should prefer:
- `Roll vs Best 1FT` over "candidate generation API only"
- `full weekly choice set` over "2FT support hidden behind unfinished UI"
- `selling value correctness` as a user-facing trust upgrade, not as invisible technical debt work

## Recommendation

The best product to build is not "an optimizer" and not "AI transfer suggestions" in isolation.

It is a `Transfer Decision Workspace` on My Team that:
- compares realistic options against `Roll`
- ranks them over a selectable horizon
- handles bank, transfers, and hits correctly
- explains the tradeoffs clearly

That is the strongest overlap between current community demand, competitor strengths, and FPLytics' existing architecture.

## Next Step

Implement Phase 1 first:
- My Team decision card
- `Roll` vs `Best 1FT`
- `1 GW` / `3 GW` horizon selection
- projected gain, bank impact, and concise explanation
- tests for ranking and empty states

That is the smallest version that still gives the user a meaningful before-deadline answer, and it creates a clean base for the later phases without shipping hollow intermediate steps.
