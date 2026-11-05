# Star Princess — Master Game Rules

**Games:** Drink It! (individual Bounty Board) and Ship It! (team photo scavenger hunt)  
**Status:** Reconciled authoritative gameplay framework · Version 1.1 · November 4, 2026  
**Scope:** This document defines what counts, how points and achievements are awarded, when play is available, and how the games conclude. It is **not** a screen-flow, React, database, authentication, or infrastructure specification.

**Content is separate from rules.** The final cocktail and ingredient bounty lists are **not embedded here** and remain subject to review. The seven featured bars, seven Daily Challenges, and exact achievement catalog are configured separately when selected. None of those pending content selections changes the rules below.

---

## 1. Games, participants, and competition

- The cruise has two independent games: **Drink It!** and **Ship It!**
- A person may participate in one or both games. Membership is established before sailing and can be changed by the organizer.
- **Drink It!** is an **individual** points competition. Each enrolled player has their own bounty claims, score, and achievements.
- **Ship It!** is a **fixed-team** points competition. Each player belongs to an assigned team; all scavenger progress, scores, and achievements belong to that team.
- The games maintain **separate leaderboards**. Their point scales are not combined.
- The highest score wins each game. **Ties share the same finishing position**, including a tie for first. No tiebreaker is required.
- Both games follow the **honor system**. Players are trusted to report what they completed and with whom; routine proof review, companion confirmations, and cross-checking are not part of play.

## 2. Cruise schedule and end of play

All times refer to the app's **centrally administered Ship Clock**, not an individual phone's timezone or the local time at a port. The organizer can adjust it manually or preconfigure an optional seven-day overnight offset schedule; this changes when time slots occur, not their assigned bounty identities. Absolute server timestamps are used for ordering valid submissions and exclusive achievements.

| | Days 1–6 | Day 7 |
|---|---|---|
| **Drink It! scoring window** | **12:00 PM–11:00 PM** | **12:00 PM–6:00 PM** |
| **Ship It!** | Available throughout the cruise day, including mornings | Available until **6:00 PM** |
| **Final scores / awards** | Not final | **6:00 PM: all scoring ends; Awards Mode begins** |

- Before Drink It! opens at noon, its bounty cards are unavailable/greyed out and show a plain message such as **“Game begins at 12:00 PM.”** Its public board closes after the daily window.
- **At exactly 6:00 PM on Day 7, both games stop accepting all new player submissions, including unscored drink logs.** A request received before the deadline remains valid even if its processing finishes afterward. No points can be added from new submissions received afterward. The final leaderboard is available and the app switches into **Awards Mode** for Cruise Wrapped and achievements.
- At that same finale, **all formerly secret achievements become visible**, earned or unearned. First-to/exclusive awards retain their actual owners.
- Earlier Drink It! rotations have a private late-logging allowance described in Section 4. **There is no grace period beyond 6:00 PM on Day 7.**

---

## 3. Drink It! — objective and universal rules

**Objective:** Earn more points than the other Drink It! players by claiming rotating Cocktail and Ingredient Bounties, a daily Bar Bounty, and a Daily Challenge.

There are **four categories**, each with **at most one scoring claim per player per cruise day**:

1. **Cocktail Bounty** — order the featured named cocktail.
2. **Ingredient Bounty** — find a menu cocktail with the featured ingredient.
3. **Bar Bounty** — order an alcoholic beverage at the featured bar with eligible companions; larger groups earn more points.
4. **Daily Challenge** — complete that day's special one-time objective.

**Rules applying to all Drink It! categories:**

- The schedule and current bounties are **shared by all enrolled players**. No opportunity is taken away when another player claims it; there is **no first-to-claim race**.
- A player may **pass on a qualifying bounty** and reserve that category's one claim for something later in the day. In the logging Review screen, **all currently available and eligible bounties are preselected** for convenience. Players may deselect them before submitting; a warning confirms the choice if any available bounty is left unselected. Eligibility alone does **not** award points; only successful submission of a selected claim does.
- **Overlap is allowed.** One beverage/outing may meet several categories. If the player still has those claims available, all eligible points may be awarded for the same event. No additional drink is required just because multiple categories match.
- For a **Cocktail, Ingredient, or Bar Bounty**, the claimant must order the qualifying beverage **while with at least one other enrolled Drink It! player**. The companion does **not** have to order the same drink or claim the same bounty.
- **Daily Challenges are the exception:** they have their own completion method and any participation requirements stated in that day's challenge. They do not require selecting/logging companions merely to submit completion.
- Normal drink logging can continue after claims are used or when a player is alone, but **only successful bounty claims add to the Drink It! score**.
- Players may choose whether to claim any qualifying categories when recording a drink; eligibility alone does not spend the daily claim.

### 3.1 Cocktail Bounty

**Objective:** Order the **exact named cocktail** shown in the active rotation.

- A new cocktail appears **hourly** during the Drink It! window.
- The bounty presents the cocktail's **name, listed ingredients, one designated qualifying bar, and points**. Tapping the card prefills both that bar and drink in the logging flow.
- Cocktails are scored by the **unusualness/adventurousness of the recipe**, not alcohol strength, number of shots, bar exclusivity, or distance traveled.

| Cocktail tier | Points | Meaning |
|---|---:|---|
| Familiar | **25** | Recognizable or straightforward |
| Interesting | **50** | Creative variation or interesting ingredients |
| Unusual | **75** | Unexpected ingredients or preparations |
| Adventurous | **100** | Especially unconventional combinations |

- The rotation selects randomly from a curated eligible pool, **without replacement**. Once a cocktail appears, it **does not appear again as a Cocktail Bounty during this cruise**, whether anyone claimed it or not.
- There are **no tier quotas, scheduled jackpots, or guarantees** that a 100-point cocktail will appear on a particular day.
- **The designated bounty bar is required.** The same named cocktail at a different bar does **not** qualify for that Cocktail Bounty. A genuine menu mismatch can be reported via the limited unlisted-drink flow at the designated bar. If the featured cocktail is unavailable, the organizer may use the approved **Skip Current Cocktail** emergency action to draw an unused reserve without changing the active slot end time or later slots; no automatic skip occurs.

### 3.2 Ingredient Bounty

**Objective:** Find and order a **named, listed menu cocktail** containing the active single ingredient or named spirit style.

- A new ingredient appears **every two hours** during the Drink It! window.
- Players see the **ingredient objective and point value**, but **not** the qualifying drinks or bar locations. Finding a suitable bar/menu item is part of the challenge.
- A cocktail must genuinely be offered as a **named item on a current bar menu**. Asking a bartender to add the ingredient to an unrelated drink, or inventing an off-menu drink, **does not qualify**.
- If a qualifying current menu drink is absent from the pre-cruise database, it **can still count** under the honor system. If an existing named drink at a selected bar is missing the active ingredient in the app catalog, a player can confirm that ingredient at Review; this adds a persistent **bar-specific drink/ingredient association** for future players, not a global recipe edit across bars.
- Each objective is **one consistently normalized ingredient category**. Closely overlapping names/variants are grouped into one objective rather than separately offered (for example, melon flavor and melon liqueur should not duplicate each other).
- Eligible ingredients include non-base components, liqueurs, and sufficiently specific spirit styles. A brand name is not normally its own hunt.
- **Bar coverage is the primary basis for points; distinct qualifying cocktail count is secondary.** These rankings are fixed before sailing, even if actual menus or player-confirmed ingredient associations differ. An onboard correction never recalculates the rarity tier or existing points.

| Ingredient tier | Points | Working listed-bar coverage |
|---|---:|---|
| Easy to Find | **25** | 11–13 bars |
| Less Common | **50** | 7–10 bars |
| Hard to Find | **75** | 4–6 bars |
| Elusive | **100** | 2–3 bars |

- One-bar-only ingredients are generally excluded from the approved pool; high-tier hunts should still have multiple plausible qualifying drinks.
- Ingredient objectives are drawn randomly from their separate curated pool **without replacement**. There are **no repeat objectives or guaranteed daily point tiers**. An organizer-only **Skip Current Ingredient** action may replace the currently shown objective with an unused reserve, sharing the original slot end time and existing hidden grace; the skip does not change future scheduled rotations or previously earned points.

### 3.3 Bar Bounty

**Objective:** Visit that day's featured bar and **order an alcoholic beverage** with other eligible Drink It! players.

- One **preselected featured bar** is assigned to each of the seven days. The featured bar does **not** rotate during the day.
- **Wine, beer, shots, and cocktails all count**, provided they are alcoholic. **Nonalcoholic beverages do not qualify** for the Bar Bounty.
- A qualifying claim must include **at least two eligible Drink It! players together**, including the claimant.
- The claimant earns **25 base points + 10 points per additional eligible companion reported**, capped at **95 points**.

| Eligible people together, including claimant | Points to the claimant |
|---:|---:|
| 2 | 35 |
| 3 | 45 |
| 4 | 55 |
| 5 | 65 |
| 6 | 75 |
| 7 | 85 |
| 8 or more | 95 (cap) |

- To increase a claimant's Bar Bounty score, a companion must be enrolled in Drink It! and **eligible for that day's Bar Bounty when the group gathered and ordered**. Someone who used their Bar Bounty on an earlier visit that day does **not** increase another group's multiplier.
- Everyone independently reports their companions on the **honor system**. Players' reported group sizes **do not have to match**. There is no verification, reconciliation, or penalty merely because one member submitted before another.
- One Bar Bounty claim per person per day; extra drinks or return visits do not add more Bar Bounty points.

### 3.4 Daily Challenge

- There is **one predetermined Daily Challenge per day**, worth **50 points** per player who completes it.
- Daily Challenges are **specific one-time events or activities**, not a rotating drink suggestion or a generic task to claim repeatedly throughout the day. Their exact location, event conditions, and any meeting time are set in the approved daily-challenge list.
- To claim it, a player indicates **the challenge was completed** and submits **a photo**. An optional caption may accompany it. **No companion-selection step is required** for this category.
- If the challenge requires an **All-Hands** gathering, a named drink, or another special condition, that specific description controls whether it was completed. These conditions are honored without routine verification.
- It can overlap with the other categories: a drink or event that satisfies the Daily Challenge may also support a separate Cocktail, Ingredient, or Bar claim.
- Only a qualifying activity **within that day's Drink It! game window** counts; Day 7's challenge must be completable before **6:00 PM**.
- The exact seven challenges, days, and any All-Hands requirements are **pending final selection**. The 50-point rule is settled.

### 3.5 Drink It! rotation counts

| Category | Days 1–6 | Day 7 | Total across cruise |
|---|---|---|---:|
| Cocktail | Hourly: noon, 1, 2, …, 10 PM (**11/day**) | Noon through 5 PM (**6**) | **72** |
| Ingredient | Every two hours: noon, 2, 4, 6, 8, 10 PM (**6/day**) | Noon, 2, 4 PM (**3**) | **39** |
| Bar | One fixed featured bar per day | One fixed featured bar | **7** |
| Daily Challenge | One fixed event/activity per day | One fixed event/activity | **7** |

**Private late-log rule — not player-facing:** A rotating Cocktail or Ingredient Bounty remains claimable until **15 minutes after its normal slot ends**, even though the next bounty is shown on schedule. For example, the 2:00–3:00 PM Cocktail Bounty can still be claimed until **3:15 PM**. This is a courtesy for someone who ordered before the rotation and logged late; it is not an advertised extra ordering window. The category's daily limit still applies. On Days 1–6, the final 10:00–11:00 PM rotating offers have hidden grace until 11:15 PM. On **Day 7**, no claim can score after the **hard 6:00 PM cutoff**, even for the final rotation.

---

## 4. Ship It! — objective and rules

**Objective:** Fixed teams compete to earn the most points by completing the ship's **50 photo scavenger challenges**.

- A player belongs to **one assigned Ship It! team**. A team consists of its registered members; the app already knows which team the submitting member represents.
- **Any team member** may submit a completion: select a challenge, upload its **required photo**, optionally write a caption, and submit. **No team or teammate selection is required.**
- A valid completion credits **the team once** with that challenge's points, not every member separately and not multiplied by team size. All teammates share the team's completion status and ranking.
- **Each team can score each challenge only once**. A completion by one team does **not** remove the challenge for other teams.
- Team members are expected to participate together as required by the challenge. Whether the group photo/activity meets its description is judged on the **honor system**; teammates need not tag or confirm one another.
- Completions count immediately by default; there is **no routine admin/photo approval queue**.
- If the group determines that a submission does not count, the organizer may **revoke that completion before the Friday 6 PM finale**. The team's awarded points are removed and that challenge becomes available for the team to complete again. Admin may similarly void an invalid Drink It! submission before finale; **no post-finale voids, edits, or corrections**.
- Ship It! is available throughout the cruise, **including before noon**, independently of Drink It!'s bounty hours. It stops scoring at **6:00 PM on Day 7**.

### 4.1 Scavenger scoring

The original hunt's **1–5 point bands are scaled to 100–500 points**, with no change to relative difficulty.

| Scavenger category | Number of challenges | Points per challenge | Category maximum |
|---|---:|---:|---:|
| Classic Ship Landmarks | 10 | **100** | 1,000 |
| Food & Drink Discoveries | 10 | **200** | 2,000 |
| Quirky Details & Hidden Artifacts | 10 | **300** | 3,000 |
| Interactive Crew & Activity Challenges | 10 | **400** | 4,000 |
| Creative Team & Action Shots | 10 | **500** | 5,000 |
| **Total** | **50** | | **15,000 per team** |

The full text of the 50 challenges stays in the **separate scavenger-hunt content file**. This document establishes their scoring and completion rules, rather than duplicating their descriptions.

---

## 5. Achievements — shared principles, different owners

Achievements are optional, fun accomplishments separate from the point competitions. **They never add points to either leaderboard.**

- **Drink It! achievements** are awarded to **individual players**.
- **Ship It! achievements** are awarded to **teams**.
- Each achievement has a defined condition and can be **public** or **secret**, and independently **shared** or **exclusive**.
  - **Public:** its details are visible while unearned.
  - **Secret:** its details are hidden while unearned and revealed when that player/team earns it.
  - **Shared:** multiple eligible players/teams can earn it, each once.
  - **Exclusive:** only **one** player/team can earn it—the **first valid qualifying submission/completion**.
- **First-to-find means first to successfully complete the qualifying upload/submission**, not whoever says they physically found it first. Where a condition is achieved through accumulated activity, the first qualifying recorded milestone wins.
- If the activity that justified an exclusive award is revoked as invalid, the award may pass to the next-earliest valid qualifying player/team. No elaborate race adjudication is needed.
- At **6:00 PM on Day 7**, **all secret achievement descriptions become public**, whether anybody earned them or not. Exclusive awards remain exclusive; unclaimed ones remain unclaimed.

### 5.1 Supported achievement families

The final achievement names and thresholds are separate content. The system should be able to express at least these **types** without changing core rules:

| Achievement mechanism | Drink It! examples | Ship It! examples |
|---|---|---|
| **Running count / threshold** | Log a number of drinks; claim a number of bounties | Complete a number of hunt items; reach team point milestones |
| **Distinct-item collection** | Visit distinct bars; encounter different ingredients, spirit styles or companions | Complete items from all five categories |
| **Exact-item match** | Log one specified cocktail or an ingredient-family cocktail | Complete one named hunt challenge |
| **Category or collection completion** | Complete several types of bounties | Complete every hunt in a category |
| **Same-event combination** | Use one drink to claim multiple bounty types (e.g., **The Stars Align**) | Complete a designated special scavenger condition |
| **Time or cruise-day condition** | Log across distinct days or during a designated time window | Complete a set of challenges on a designated cruise day |
| **First-to / exclusive milestone** | First to visit a set of bars or reach another qualifying exploration milestone | First team to submit a specified challenge; first to a collection milestone |

Drink It! achievements may use logged drink identity, ingredients and ingredient families, spirit styles, bars, companions, bounty claims, and timestamps. Any estimated spirit volumes (for example, a fixed **2 oz reference per drink**) are **game approximations**, not measurements of actual alcohol consumed. Specific estimated-volume/consumption-related achievements have **not yet been chosen**; this document does not create them. Any estimates must be presented as approximations, not measured intake. Creative achievement content is a separate, later decision.

Achievements may also produce non-scoring activity announcements in the social feed.

---

## 6. Recording activity and viewing results — gameplay expectations only

These describe the **information players provide**, not the detailed screens or technical design.

- **Drink It! normal drink log:** Bar, selected drink, Drink It! companions, optional photo, and a review of qualifying bounties **preselected by default**, which the player may explicitly deselect before final submission. Ordinary unscored logs are allowed. A genuinely named menu drink missing from the reference list can be reported under the honor system without needing a full recipe reconstruction.
- **Drink It! Daily Challenge completion:** Confirm completion, photo, optional caption; no companion selection. This is a distinct kind of completion, not a required run through the standard drink logging process.
- **Ship It! completion:** Choose challenge, upload photo, optionally add caption. The team is automatically determined from the submitting player's membership.
- **The Gallery:** Each game has a separate chronological activity stream for drink logs or scavenger completions and earned achievements; these announcements award no additional points. No separate bounty-claim announcement reveals the ingredient puzzle. Player posts are final after success, with no post-submission editing. Ordinary Drink It! log photos are optional; Ship It! and Daily Challenge photos are required.
- **Drink It! leaderboard:** Individual cumulative claimed-bounty points. **Ship It! leaderboard:** Team cumulative scavenger points.
- **Cruise Wrapped / Awards Mode:** At the finale, show one introductory Start/reveal screen followed by final standings, achievements (including formerly secret ones), and static summaries of recorded activity. The reveal can have a small nonpersistent celebratory animation. Wrapped statistics and superlatives are **non-scoring**. If multiple players or teams tie for a Wrapped superlative, **all tied winners are shown**; no arbitrary single winner is chosen.

---

## 7. Content to supply later (does not block app design)

1. **Cocktail Bounty pool:** Final retained cocktail names, recipes/ingredients, known bars, oddity tiers, and points. Current ranking is a review draft. The underlying menu is a snapshot and may not perfectly match onboard offerings.
2. **Ingredient Bounty pool:** Final normalized ingredient objectives, qualifying menu evidence, bar counts, rarity tiers, and points. Current bar-first list is a review draft. Qualifying locations are reviewer-facing data, not bounty hints to players.
3. **Seven featured Bar Bounty locations:** Exactly one assigned to each cruise day.
4. **Seven Daily Challenges:** One assigned to each day, including exact one-time objective, any scheduled meeting/All-Hands requirements, and photo-worthy completion conditions. All must fit their day's game hours.
5. **Achievements catalog:** Exact names, conditions, visibility, exclusivity, and ownership, using the mechanisms in Section 5.
6. **Player/team roster and cruise calendar:** Assigned teams, Drink It! enrollment, and ship-local sailing dates.

**Rule changes require an explicit decision.** Content revisions, design changes, UI refinements, and implementation choices should not silently change the scoring or eligibility rules in this master.

---

## Reconciliation note (November 4, 2026)

This v1.1 updates the November 1 gameplay rules to reflect the organizer's later approved UX decisions: **Ship It!** naming, featured Cocktail's **one required bar**, the central/admin-adjustable Ship Clock, the optional overnight seven-day clock schedule, all qualifying bounty selections defaulting to selected, persistent bar-specific ingredient corrections, the organizer's limited current-slot bounty skip, no post-submission player editing, and an absolute Friday 6 PM finale with **no** late admin voids. It does **not** finalize the content catalogs or mandate a specific technical architecture.
