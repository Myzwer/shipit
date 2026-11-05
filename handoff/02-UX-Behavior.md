# Star Princess Games — UX & Behavior Specification

**Version:** 1.1 — consolidated approved UX behavior including Saturday menu audit and pause/resume  
**Prepared:** November 4, 2026 · consolidated handoff  
**Status:** **APPROVED FOR TECHNICAL SPECIFICATION.** Consolidates the 233-question UX audit, the organizer's numbered corrections, subsequent decision-by-decision approvals, master rules, final Figma exports, and three corrective mockups. **Final game content and engineering/configuration inputs remain to be supplied; they are not UX decisions.**

**Player-facing games:** **Drink It!** (individual cocktail bounty competition) and **Ship It!** (team photo scavenger hunt).  
**Purpose:** Define *what players see and what happens when they interact*, without specifying React components, database tables, services, code, hosting, or build order. This is the behavioral source for the forthcoming technical specification.

> **Recovery note:** This document is designed to stand alone if the original conversation disappears. The organizer explicitly approved the behavioral groups covering the Ship Clock, admin skips, ingredient corrections, default bounty selection, submission finality, account controls, photo display, achievements/notification dots, finale/Wrapped, Gallery/reactions, error handling, and admin safeguards. These decisions override earlier provisional language. The separate final content catalog and technical implementation remain outstanding.

## 0. How to read this document

### Source-of-truth order

1. **Latest explicit organizer correction or decision** controls when it updates older material. One correction applies globally wherever the same behavior occurs; absence of a repeated correction does not create a contradiction.
2. **Master Game Rules** control gameplay scoring, challenge eligibility, and achievement ownership unless superseded by a newer explicit organizer decision. Use **`01-Game-Rules.md`**. The older November 1 copy used *Cruise It!* and a more permissive Cocktail-bar rule; both have been explicitly superseded.
3. **This UX specification** controls journeys, screen behavior, controls, states, and recovery from user-facing errors.
4. **Final mockups** control visual appearance, composition, spacing language, and component states; **dummy names, points, timestamps, ingredient counts, and icon glyphs are not authoritative content**.
5. **Recommendations from the 233-question audit** are included only where they were accepted or remain compatible with the subsequent approvals. Older audit recommendations do not override this specification.
6. The **future technical specification** decides implementation, not gameplay or UX. It must not silently overwrite the preceding decisions.

### Terminology

- **Cruise day:** One of the seven sailing days, beginning Saturday (Day 1) and ending Friday (Day 7). Exact sailing dates are configuration inputs; the centrally managed Ship Clock policy is locked.
- **Scoring window:** Drink It! bounties score noon–11:00 PM Days 1–6, and noon–6:00 PM Day 7; Ship It! scoring is available throughout the cruise until the Day 7 finale.
- **Ordinary log:** A Drink It! entry that records a drink and optionally contributes achievements or Gallery activity, whether or not any bounty is claimed.
- **Bounty claim:** A scoring selection attached to a qualifying drink log. All presently available and eligible categories are **selected by default**; the player may deselect them at Review. Daily Challenge has a separate submission path.
- **Gallery:** The chronological photo/activity screen for the **current game**; never a merged public stream of both games.
- **Awards Mode:** The post-6:00 PM Day 7 read-only experience for Wrapped, Gallery, and Achievements.
- **Current game owner:** The individual player in Drink It!, or the **fixed team** in Ship It!.
- **Firsts:** Exclusive achievements owned by the first valid successfully submitted player/team; they never give leaderboard points.

### Non-negotiable product scope

- Small, predetermined roster; no public registration, profiles, messaging, comment system, push notifications, social networking, photo approvals, cross-player friend verifications, real-time racing, or paid prizes.
- Mobile-first web experience with large selectable rows, short forms, forgiving honor-system claims, accessible enough for nontechnical travelers, and minimal operator workload during the cruise.
- No full offline queue or background synchronization. A failed save must nevertheless preserve the active submission and provide a retry while the page is alive.
- All screenshots in the mockups are *visual* references; don't duplicate placeholder challenges, misleading ingredients/points, or example identities into production content.

---

## 1. Game entry, player identity, and access

**Related audit:** Q001–Q012, Q023–Q024, Q178, Q179–Q182, Q187, Q222, Q228, Q231.

### 1.1 Login

1. An unauthenticated visitor sees **a dropdown containing the pre-created users** and a **password** field, plus Log In. No free-text username field, public registration link, account-creation flow, emailed verification, or self-service recovery flow.
2. If credentials are forgotten, a short **plain-text** instruction in the home/account administration area may indicate that the organizer can reset them. Do not build a help ticket, contact button, or password-recovery workflow.
3. Keep sessions signed in as long as practical over the cruise. Do not force daily reauthentication. A single account may be used on more than one device; no special device pairing or forced device logout.
4. The organizer creates accounts ahead of time; if a person joins later, the organizer can create their account, enable game membership, and assign a team if applicable.
5. If access to an active game is revoked, stop further submissions and route the player to an allowed destination with a concise explanation; do not erase their historical participation merely because access was switched off.

### 1.2 Routes and game selection

| Route / action | Required behavior |
|---|---|
| `/` | The two-game launch screen, **only for players enrolled in both games**. If the player has access to only one game, immediately redirect to that game's Home rather than display the chooser. |
| `/shipit` | Ship It! Home, if enrolled. |
| `/drinkit` | Drink It! Home, if enrolled. |
| Member of both games | May see the game chooser at `/`; a small **swap/cycle icon in the top-right** of a game's UI switches **directly** to the other game's Home. |
| Member of one game | No visible switch icon; trying `/` directs them to their game. |
| Member of neither game | Plain unavailable/not enrolled screen; no signup controls. |
| Switch while editing a form | Use the same **Keep Editing / Exit and Discard** confirmation as any other deliberate departure. No silent carryover of a drink draft to the other game. |

The public names are **Drink It!** and **Ship It!**. Do not surface the old *Cruise It!* label except as a historical filename/source reference.

### 1.3 Account information placement

- There is **no Account tab, hamburger menu, account drawer, or separate Account page**.
- Home is scrollable and ends with **How to Play / rules**, then a small **Account** section containing passive logged-in identity/team details. In Ship It! the team is also named near the progress summary and team-member names appear on the leaderboard cards.
- The bottom-of-Home account section is **not a profile management screen**. It contains a small **Log Out** action for everyone and a small **Admin** link visible only to the organizer. Logging out returns to the login screen; no extra confirmation or account editing.
- Only the organizer sees Admin, never regular users. No “Contact Josh” reminders, chat features, or support request widgets.

---

## 2. Shared page structure and navigation

**Related audit:** Q013–Q024, Q201–Q204, Q214–Q218, Q221, Q224, Q230.

- Both games share the four-icon **floating bottom navigation pill**: **Home, Plus/Log, Gallery, Achievements**. In the Ship It! theme the icons and pill use its blue/gold palette; in Drink It! they use teal/magenta. All four icons are visual indicators; final actual pictograms should come from **Font Awesome** and remain optically consistent. The icon glyphs in mockups are illustrative.
- Bright icon = currently active destination; faded icons = inactive. The navigation floats above the bottom screen edge with iPhone safe-area allowance. It stays visible on normal pages and during the logging flows unless a specific temporary overlay requires focus. The page must scroll enough that the pill cannot conceal the last row/action.
- **Home:** current game's main dashboard. **Plus:** Drink It! five-step log, or Ship It! challenge list. **Gallery:** game-specific activity. **Star:** achievements for the current game's owner.
- Page headers are full-width and scroll with the page. The fixed bottom navigation remains available. Text and buttons stay legible at small phone sizes; long content wraps/expands rather than shrinking to tiny fonts.
- The three-tab Awards Mode navigation replaces the normal four tabs at the finale: **Wrapped/Awards, Gallery, Achievements**. Plus/Log disappears.
- The organizer asked that **wizard step labels/progress segments are tappable**: they return to the indicated earlier step. Browser/phone Back should go to the preceding step, not exit the whole application unexpectedly.
- Tapping the Plus tab while *already inside an unfinished log* prompts first; a confirmed fresh start discards the existing entries and begins at Step 1.
- **Intentional departure from an unfinished form:** show **Keep Editing** or **Exit**. Exit discards unsaved choices; **no persistent draft/resume feature**. Switching briefly to another app (e.g., Instagram) without the browser discarding the page should not intentionally reset the wizard. A failed network submission is a different case and must preserve what was entered for Retry.
- Headings, points chips, badges, category labels, progress bars, and leaderboard rows are display-only unless a click action is explicitly defined. Teal/blue primary controls communicate actions; magenta/gold pills generally communicate information. Reactions and row selections have their own designed active states.
- **How to Play** appears below the leaderboard on both Home pages. Use compact expandable player-facing rules; do not reveal secret grace windows or implementation notes. Account information appears below the rules.
- Leaderboard rows are not links to profiles, achievement cards do not open new detail pages, completed scavenger cards are disabled, and informational point/tier chips are not buttons.

---

## 3. Drink It! Home and Bounty Board

**Related audit:** Q025–Q044, Q081–Q092, Q214, Q229, Q232–Q233.

### 3.1 Layout and content

- Home has four **horizontally swipeable bounty cards** in one circular/infinite-feeling carousel: **Cocktail, Ingredient, Bar, Daily Challenge**. Neighboring cards peek from the edges. **Do not add arrow buttons**; swiping works in either direction and wraps around to the beginning. A new visit/session may start with Cocktail; remembering the active card within an open session is acceptable.
- Below the carousel: individual leaderboard ordered by score, then player-facing rules, then small account information. Leaderboard rows display rank, player, **Bounties X/28**, and cumulative score. The '28' is the maximum four daily bounty categories × seven days, **not** number of drinks logged.
- A tied score has a **shared rank** (e.g., 1, 1, 3). Keep the *incumbent* player/team visually above the challenger when a tie is reached; they must be beaten on points to move below the other person. Do not use who earned points sooner as a secret game tiebreaker or produce fake unique ranks.
- On returning to Home or foregrounding the app, update the displayed bounties and standings. While Home remains visible, standings refresh periodically, without requiring a hard browser reload.

### 3.2 Card content

| Card | What the card shows | Action |
|---|---|---|
| **Cocktail** | Exact named drink, oddity tier, 25/50/75/100 points, menu ingredients, **one designated bounty bar/location**, and countdown to the ordinary public rotation. Use accessible **layperson translations** for recognizable brands/liqueurs where the data supports it, e.g. `Cointreau (orange liqueur)` or `Grey Goose (vodka)`. | **Claim It** prefills **both bar and drink**, skips directly to **Friends**, then follows the normal log flow. Points aren't granted from Home. |
| **Ingredient** | One normalized ingredient/style, point tier, **curated count of known bars** (e.g., “Available at 5 bars”), and countdown. **Do not show bar names or matching drinks.** | **Claim It** enters the ordinary bar → drink wizard with no hidden answer revealed. |
| **Bar** | Today's preselected location, 25 base points plus 10 per additional eligible player (max 95), and time available. | **Claim It** prefills the bar, then goes to selecting an alcoholic beverage and companions. |
| **Daily Challenge** | Today's special title and brief directions, 50 points, and schedule/availability as approved content. | **Claim It** starts the **separate photo-based Daily Challenge completion path**. |

The exact cocktail/ingredient lists and seven fixed bars are pending content. The user corrected the earlier assumption that a Cocktail Bounty lets a player pick among several bar locations: **this UX preselects a single designated bar**. The reconciled Master Game Rules explicitly require that single designated bar, even if a same-named drink appears elsewhere.

### 3.3 Bounty-card states

1. **Before the first opening:** all four cards use the disabled “See You Tomorrow / Game begins at noon” visual treatment, with a live countdown to the initial opening. Do not reveal upcoming random bounties.
2. **Days 1–6, noon–11 PM:** current unclaimed cards are active; claimed cards use the strong **CLAIMED** state with the drink/objective and points this player earned.
3. **Tap an already-claimed card:** momentarily reveal the **currently active** bounty underneath, allowing the player to see what they've missed. Any navigation/interaction away conceals it again; do not make a conspicuous extra button for this.
4. **Days 1–6, 11 PM onward:** all cards change to **See You Tomorrow**, with countdown to the following noon. Public card state is closed even though private late claims might still be possible until 11:15 PM.
5. **Next noon:** today's quotas reset and the four cards return to their normal active/unclaimed states.
6. **Day 7 noon–6 PM:** same behavior with an earlier final cutoff. **At precisely 6 PM, leave active game mode and enter Awards Mode** rather than show another overnight countdown.
7. Countdown numbers reflect the normal *public* end/rotation; do **not** display the private extra 15 minutes.

### 3.4 Rotation rules reflected in the UI

- Cocktail changes every hour at 12, 1, ... 10 PM; Ingredient every two hours at noon, 2, ... 10 PM. One shared cruise-wide nonrepeating schedule for all players; no guaranteed high-tier draw on a given day.
- Daily Bar and Daily Challenge do not rotate within the day. Where Daily Challenge content specifies a meeting time, show it descriptively; that time passing does not automatically create a second event engine or force a new daily challenge.
- **72 cocktail slots and 39 ingredient slots** across all seven days, due to the early Day 7 ending. Pools require enough eligible items to cover those slots.
- **Regular drink logging stays available before noon and after 11 PM** (within the cruise and before the finale); normal non-grace bounty scoring does not. At the Day 7 6 PM hard stop, all logging and new scoring end.
- **Private grace:** a rotation remains claimable through 15 minutes after the normal slot ends, but the *new* card shows normally on schedule and the grace is not advertised. E.g., a 2:00–3:00 PM Cocktail may qualify through 3:15 PM even though the 3 PM Cocktail is on Home. Days 1–6 final 10 PM slots may score through 11:15 PM; no grace after Day 7 6 PM.
- Eligibility is confirmed on successful submission, not reserved indefinitely because the form was opened earlier. A late submission cannot earn points after its eligibility window. If a selected claim expires mid-review, **explain the issue rather than silently dropping points** and allow the underlying ordinary log to continue.
- If the previous and current Ingredient rotations both genuinely match one cocktail during grace, do not score two claims in the same category. Present a single choice between eligible rotations; do not expose the previous ingredient as a general hint elsewhere.
- **One centrally managed Ship Clock** defines all scoring windows, rotations, timestamps presented as ship-local, and finale transitions. Players' device time zones and location/port APIs do not determine eligibility. The Admin clock and its optional seven-day schedule are specified in §10.1. Real absolute submission ordering is retained independently of display clock adjustments.
- When an earlier and current rotation overlap because of the hidden 15-minute grace, the player may choose at most **one** claim in that category that day. The visible Home card shows the current rotation, not a public hint about the prior rotation.

---

## 4. Drink It! ordinary log — five-step wizard

**Related audit:** Q016–Q019, Q028–Q032, Q045–Q080, Q081–Q086, Q190–Q199, Q219–Q223, Q226.

**General behavior:** One simple mobile question per step; large tap targets; no unnecessary confirmations. Top progress labels: **Bar → Drink → Friends → Photo → Review**. Progress is visible and earlier steps are tappable. Back preserves entries inside the active wizard. Entry from a prefilling bounty card can skip the already-known steps.

### Step 1 — Bar

- Prompt: **Where are you?** Display the known ship bars as a scrollable row/card list with name and deck. Tap anywhere on a row to select and advance immediately.
- **Sort by:** Alphabetical (default) or Deck. Deck sort means **lower decks first, ascending to upper decks**. Sort changes the order, not which bars exist.
- Real decks come from reviewed bar data, not placeholder numbers in mockups.
- The final row must remain reachable above the floating navigation.

### Step 2 — Drink

- Prompt: **What are you having?** Show named drinks available at the bar selected in Step 1. A search field filters drink names within that bar. Selecting a drink row immediately advances.
- **Do not display recipe ingredient lists in this picker.** The Ingredient Bounty is supposed to require actual menu exploration; users shouldn't be able to use the list as a ready-made ingredient search tool.
- The final three options at each bar are **Beer**, **Wine**, and **Other Alcoholic Beverage** (shots, hard seltzers, canned alcoholic beverages, etc.). Do not add a soda/water/mocktail logging option.
- Those generic categories support an ordinary log and the alcoholic **Bar Bounty** only; they do not automatically count as a named Cocktail or Ingredient Bounty.
- At bottom: **My drink isn't listed**. If search gives no results, also surface the same fallback immediately by the empty search result.

### Step 2A — Unlisted drink fallback (only when needed)

- Retain the chosen bar. Request only **drink name** and broad **type** (cocktail, beer, wine, other alcoholic); do **not** force players to reconstruct a full recipe.
- Ask in plain language whether the named menu cocktail contains the **currently active Ingredient Bounty ingredient**. This is an honor-system answer, not a proof-upload process. If confirmed, make that Ingredient claim available on Review.
- The drink must genuinely be a named current menu offering for an Ingredient Bounty. Bartender-added ingredients and invented off-menu mixtures do not qualify. Ordinary unlisted alcoholic entries may still be logged without scoring.
- Do not add player-entered drinks to the predetermined global Cocktail Bounty rotation. Player-confirmed missing Ingredient Bounty ingredients on an existing **bar-specific** named drink permanently enrich the shared effective ingredient catalog; the active player qualifies immediately. See Review and Admin correction rules below.
- If the featured Cocktail Bounty entry cannot be found in the drink picker at its **designated bar**, retain the existing unlisted-drink fallback and allow confirmation of that exact featured named drink at that bar on the honor system. A similarly named cocktail ordered at a **different bar** does not qualify for the featured Cocktail Bounty. Ingredient claims can still qualify at another bar when the named menu recipe matches.

### Step 3 — Friends

- Show the **other Drink It!-enrolled players** as checkable rows/chips; do not include the person logging. Selecting multiple companions is permitted. No invitations, attendance verification, matching their own logs, or “everyone must select the same group” logic.
- People enrolled only in Ship It! **do not** qualify as Drink It! companions.
- User may continue with zero companions to make an **ordinary unscored log**. Do **not** interrupt them; underneath the selected chips show a small explanatory note: **“Must be with someone else to log a bounty.”** The three drink-based bounty rows will remain unavailable if there is no eligible companion.
- For a Bar Bounty, points are based on the eligible group *when the drink was ordered*: **25 base + 10 per additional eligible Drink It! person, cap 95**. Companions who had already claimed their own Bar Bounty earlier that day do not increase it. Players self-report on the honor system; there is no cross-player reconciliation.
- Drink It! players can earn Cocktail or Ingredient Bounties together even if their companions order something different.

### Step 4 — Photo and optional caption

- Normal drink logs **do not require a photo**. Allow take/select image, remove/replace before submit, skip photo, and optionally type a caption even with no image. One image maximum per log.
- Show a short note that **Gallery previews** are cropped to a square, advising users to keep the subject centered. **Do not permanently crop away the original composition**: preserve an optimized, uncropped, downloadable image while rendering square previews.
- Reuse the existing mockup's photo/caption visual pattern. Do not make a separate media editor, cropper, sticker tool, or multi-photo gallery.

### Step 5 — Review and choose bounties

- Show the selected **drink, bar, companions, photo preview**, and caption. If no image, **show the branded placeholder** at Review so users know what will appear in Gallery; if no caption, show **“No caption provided.”**
- Present the potential **Cocktail / Ingredient / Bar** rows with the designed selected, unselected, and unavailable states. **All currently eligible, still-unclaimed bounties start selected automatically**—whether one, two, or three categories qualify. The player can deselect any before submitting. No Daily Challenge row here; Daily is separate.
- Selected rows read **SELECTED** with checkmark and the existing magenta styling; optional helper text says **Tap to deselect**. Unselected eligible rows read **AVAILABLE**; an already-used daily category reads **ALREADY CLAIMED** and cannot be selected. Do **not** display the obsolete “Tap to Claim” instruction as if a tap were required.
- If any eligible bounty remains manually unselected when **Submit Drink** is tapped, warn once: **“You have an unclaimed bounty available. Submit anyway?”** with **Submit Anyway** / **Keep Editing**. No warning when all eligible claims are selected or none is available.
- Show points for selected categories; point chips are informational. The whole qualifying row/toggle is the interaction. Changing bar/drink/companions by going Back recalculates eligibility and discards invalid selections.
- A companion is required for each drink-based bounty. Zero companions allows a **zero-point ordinary log** without blocking submission; the noneligible bounty rows cannot be claimed.
- Beneath the bounty rows retain the mockup's text link **“My drink has the ingredient bounty but it's not available?”**. It asks **“Does [selected drink] contain [active ingredient]?”**. **Yes** immediately adds the missing ingredient to the effective shared ingredient list for that **exact drink at that exact bar**, and marks this Ingredient Bounty selected if the player's other eligibility requirements are met. The new shared ingredient association helps future logs. No edit-any-ingredient interface for normal players.
- Do **not** retroactively recalculate past claims/achievements just because the catalog was enriched. Do **not** reshuffle current/future bounty schedules or change the featured ingredient tier/points. A duplicate confirmation is harmless. Admin may remove an incorrect player-added association (§10).
- **Submit Drink** is the final save. Until a verified successful save, no points or achievements are awarded. A successful submission is **final and not editable**; Review is the place to catch errors.

### Submission semantics and destination

1. Save the drink, selected claim(s), associated points, and any photo as **one user-visible all-or-nothing action**. A half-saved log or half-awarded points result is not acceptable. An ingredient correction confirmed during Review is committed consistently with the successful qualifying submission, not left as a misleading success if the submission fails.
2. While saving, keep the form visible, show a lightweight busy/loading state, and prevent repeat taps.
3. On verified success, open **the current game's Gallery** showing that new post at the top. If practical, its post may be represented by a skeleton while finishing display. **No standalone success page and no mandatory toast.**
4. If new achievements were earned, open the achievement-reveal popup **over the Gallery**. Tapping **See It / See Them** opens My Achievements; any other dismissal returns to the Gallery beneath it.
5. On failure, **stay at Review**, preserve bar, drink, companions, photo/caption, and selected claims, and show a clear modal with what failed and **Retry**. If the server did actually accept the earlier submit but the response was lost, Retry must yield the already-saved result rather than a duplicate or second score.
6. Deliberate **Exit** discards the unsent form after confirmation; a failed request is *not* treated as a deliberate exit.
7. If a claim expires while Review is open, show an actionable explanation and allow the remaining valid selections or an ordinary log; never silently strip a claimed reward.

---

## 5. Drink It! Daily Challenge completion

**Related audit:** Q093–Q100, Q031, Q098–Q099.

- Daily Challenges are individually scheduled, one per day, **50 points each**, in the public Drink It! game window. They're defined by Dad later, with any All-Hands or required event timing included in content. **Each participant claims their own Daily Challenge**; one person's upload doesn't score everyone else.
- Home's Daily **Claim It** opens a short, independent path: title/full instructions → **“Did you complete it?”** → one **required photo** → optional caption → review → submit.
- No bar picker, drink picker, companion-picker, or regular five-step Drink It! flow. **Do not log who attended** the event in this submission.
- Photo required before submission; merely tapping “Did it” never awards points.
- The same activity may also support other drink bounties, but Daily submission itself awards **only the Daily Challenge's 50 points**. Other categories, if any, are selected through a separate normal drink log. Both may describe the same outing.
- After a successful Daily submission: enter the Gallery with its activity entry and the same achievement-popup behavior as an ordinary log. After failure: keep the photo/caption and offer Retry. No manual approval queue.
- Placeholder Daily Challenge text is fine for development; no fabricated challenges in production.

---

## 6. Ship It! Home, challenge list, and completion flow

**Related audit:** Q101–Q116, Q111–Q114, Q225.

### 6.1 Home

- Ship It! is a **fixed-team** game. Home prominently names the team and shows the team's category-by-category progress for all five categories, with **completed/total count**, **progress bar by number completed**, and **category points earned**.
- Follow with an overall **X/50** count and team total, then a **team leaderboard** that displays each team name, **the names of its members**, number completed, and points. A team completion adds its challenge's 100/200/300/400/500 points **once to the team**, never once per member.
- Progress rows can open the challenge list with that category preselected; All Challenges opens the unfiltered list. Rows have consistent tappable styling.
- Leaderboard tie ranks share position; when tied, the incumbent stays visually above the challenger unless overtaken.
- Below leaderboard: player-facing rules, then small passive Account information. The game is available throughout the cruise (including mornings) until Friday/Day 7 at 6 PM.

### 6.2 Challenge selection

- Plus opens the 50-item challenge list, grouped by five category headings. Every challenge displays **its funny/title name, full required description, and completion state**. Names are not hidden like achievement names; players need both name and task without drilling into another detail screen.
- The dropdown labeled **Filter by** filters **category only**: All / one of the five categories. All shows the five category sections in order, each with its progress and a point-value pill; selecting one shows that category's ten tasks. No giant extra search or multilayer filters.
- **Uncompleted row:** whole card is tappable; arrow indicates submission path.
- **Completed by current team:** faded, checkmarked, **not tappable**. The photo remains viewable from the Gallery; there is no completed-task detail screen.
- A challenge remains available to all other teams after one team completes it. If two teammates submit the same task concurrently, **only the first accepted team completion counts**. The second is told “Your team already completed this” and returns to the list without new points.
- Categories in the real source are 10 tasks each, 50 total, 15,000 possible points per team. Mockup names and 25/50 pills were design placeholders; production scoring is **100–500**.

### 6.3 Ship It! completion

- Tapping an uncompleted task identifies both **the task and the current team automatically**. No team selector or list of teammates.
- Reuse the Drink It! Photo / Caption and Review components with **Ship It! blue-and-gold theme**. Show the exact challenge title/instructions, one **required photo**, optional caption, the team that will receive credit, and the awarded category points; then **Submit**.
- No multi-step Drink It! bar/drink/friends selection and no second proof-approval process.
- The official challenge instructions specify how many teammates must participate or appear. The system trusts the team on the honor system and does not verify faces, people counts, or whether the evidence qualifies.
- A photo is always required; **no video uploads**. One old task allows a short video, and its content must be rewritten as a photo-only requirement before launch.
- On successful save, mark the task completed for that team, update points and achievements, and navigate to **Ship It! Gallery** with the new post. Only the submitting team member gets an immediate unlock popup. Other teammates see the updated award/activity and an appropriate unread indicator.
- Admin may revoke a disputed task, subtract the points, remove/correct its achievement/feed effects, and reopen it for the team. No general editing or peer approval process.

---

## 7. The Gallery (each game separately)

**Related audit:** Q117–Q138, Q158, Q190, Q198, Q221, Q224–Q225, Q232.

### 7.1 Scope, filters, and display

- The Gallery is **scoped to the current game**. Drink It! posts must **not** appear in Ship It! Gallery, and Ship It! posts must not appear in Drink It! Gallery. This is intentional family privacy/social separation, not merely visual filtering.
- The same Polaroid/photo-post, compact achievement-announcement, reactions, and navigation styling is reused with the current game's color theme.
- Two top filters reuse the **My Achievements / All Achievements pill pattern**:
  - Drink It!: **Everyone** and **My Gallery** (my own activity).
  - Ship It!: **Everyone** and **My Team** (the team's activity, including teammate uploads).
- **Everyone** opens by default. Newest accepted activity first; no algorithmic ranking, following, likes leaderboard, profiles, or personalized feed ranking.
- A Drink It! post includes player, selected drink/type, bar, time, optional picture/caption. A Ship It! post includes team, challenge, time, photo/caption, optionally “Submitted by [player]”. An achievement announcement is a smaller inline card with its earned title/icon and owner.
- **Never publish a separate bounty-claim announcement**, e.g. “Josh just claimed pineapple at X bar.” It would explicitly spoil the hidden Ingredient Bounty. Ordinary drink/bar posts and incidental hints are accepted; no advanced spoiler suppression.
- A missing photo is permitted for **ordinary Drink It! logs only** and uses the designed **clearly generic branded placeholder**, not a fake stock cocktail picture. **Ship It! and Drink It! Daily Challenge submissions always require a photo.** Captions may be brief or long; the photo-frame's lower portion grows to fit the text.
- Square thumbnails/previews are a consistent visual treatment. **Tapping a photo opens the uncropped full-aspect-ratio image** with a **Download icon in the top-right** so friends/family can save a proper optimized copy without screenshotting a crop. The full-aspect image is retained; only previews use a square crop.

### 7.2 Reactions

- Exactly **three reactions**: **❤️ Heart, 😂 Joy/Laugh, 🤙 Hang Loose**. The older audit's thumbs-up is superseded.
- **One reaction per account per post**. Tap an unselected reaction to choose it; tap the selected one again to remove it; choose another to change the reaction. Show all three aggregate counts.
- Players may react to their own posts/team posts. Reacting never triggers a notification dot. On failed reaction save, revert the apparent selection/count and show a small nonblocking error. No comment field, threaded replies, private messages, notification center, or push notifications.
- Reactions on a public activity in a game are visible only within that game's Gallery.

### 7.3 Refreshing and loading

- Open/foreground Gallery: fetch fresh activity and reaction counts. While visible, update periodically without requiring users to reload Safari; refreshing should not jerk the screen away from a post the user is reading.
- Load about **five posts at a time** and progressively fetch more near the bottom, using a compact skeleton while loading. Show **“End of Posts”** when the list is complete. If the Gallery is empty, show a real empty state rather than fabricated example posts.
- If new posts arrive while a player is scrolling, **do not jump the viewport**; show a small **“N New Posts”** pill which loads them and moves to the top when tapped. On return/open, revalidate posts and reaction counts.
- A Gallery error leaves already loaded posts intact, shows a small failure/Retry cue, and never blanks out the whole page unnecessarily.
- Entering Gallery from a successful log positions the user's newly created post at the top, with a skeleton only if display work is still finishing. Fresh visits generally start at the top; remaining on the page should preserve scroll position.

### 7.4 Read/unread indicator behavior

- Small dot on the Gallery nav icon indicates **unseen new posts or award announcements from another player/team**, not new reactions, generic elapsed time, or one's own new submission.
- Opening **Everyone** and loading the latest activity clears that game's Gallery dot; opening My Gallery only does not erase unseen posts elsewhere. Switching games maintains separate unread state.
- A teammate's Ship It! post counts as new if that teammate—not the current user—submitted it.
- **Achievements also get a separate nav dot** when the current player/team has earned an achievement not yet reviewed in My Achievements. **Only opening My Achievements clears its unread state**. Seeing/dismissing an unlock popup does not clear this dot. Each game tracks its own dots independently.

### 7.5 Post edits and history

- **Every successful submission is final.** Ordinary players cannot edit/delete posts, captions, photos, or claimed bounties after successful submission. There is no Edit button in My Gallery/My Team.
- No routine admin editor for claims, photos, or captions. Before the Friday 6 PM finale, the organizer has a narrowly scoped **Void Submission** emergency action for a genuinely invalid drink log or scavenger completion; it reverses dependent scoring/award effects and removes invalid activity (§10). This is not a support workflow for forgotten claims.
- After the finale, **no admin voids or result revisions**. Final rankings and Wrapped are final.

---

## 8. Achievements — same system, different owners

**Related audit:** Q139–Q158, Q209, Q216.

- **Drink It!** achievements belong to individuals. **Ship It!** achievements belong to teams. They are non-scoring extra collectibles.
- Two views: **My Achievements** (earned by me/my team, newest first) and **All Achievements** (all achievements available in the current game, grouped into **Milestones**, **Firsts**, **Other**).
- A public but **unearned** achievement hides its *funny title* (`?????`) while showing the plain qualifying requirement and relevant counter/progress. When earned, reveal its true title/icon, full description, and earned timestamp.
- An unearned **secret** achievement hides its name and requirement: `?????` / **Secret Achievement**. Where a secret achievement truly has a numeric progress threshold, show an **unexplained X/Y counter** without revealing what is being counted. No counter on one-off/binary secrets; never fabricate progress.
- **Firsts** are exclusive. Before anybody wins, show **Available**; a winner is based on first successfully accepted qualifying submission/milestone, not who actually did the action first. If claimed by another owner, display the revealed title/description on a faded card with a prominent **Claimed by [winner]** chip. If won by the current owner, use regular completed styling.
- The other team's achievement completion does not award this team anything, and one player's achievement never changes either game's leaderboard points.
- Team achievements earned through a teammate's upload are visible to all team members; only the submitting member gets the immediate popup. Exclusive awards are not a cross-phone race requiring millisecond dispute handling.

### 8.1 Unlock experience

1. After a submission is **confirmed saved**, determine any newly earned achievements, add their compact Gallery post(s), and open the **achievement unlocked** overlay over Gallery **only for the submitter**.
2. If two or more unlock from the same action, show **one combined popup** with all earned names/icons, scrolling if necessary, not a stack of modals. A brief one-time celebratory entrance animation is allowed; no persistent looping.
3. **See It / See Them** opens the current game's **My Achievements**. Any other dismissal closes the popup while staying on Gallery. Don't pop it up again every time the page reloads.
4. The achievement dot appears for a newly earned achievement until its collection has been viewed, independently of the Gallery dot.
5. When a **pre-finale** submission is revoked, reevaluate any dependent achievements and remove/reassign incorrectly awarded Firsts and stale Gallery announcements. No achievement points are added/subtracted from game leaderboards, since achievements have none.

### 8.2 Achievement condition families

The technical implementation must be able to support content-defined examples of these **behavioral types**, without requiring separate UX screens:

- Running total/counter: number of qualifying logs, drinks by spirit/category, hunt completions, team points.
- Distinct collection: unique bars, ingredients, cocktails, companions, scavenger categories.
- Exact match: specified drink or ingredient-family event, specified scavenger item.
- Same-log combination: multiple selected bounty categories earned on one drink, e.g. **The Stars Align**.
- Time-based event: logged before noon, over different days, within a descriptive cruise time window.
- First valid qualifying owner: first to a specific submitted item or threshold; exclusive once claimed.
- Completion set: all tasks in a specified category, all category types, and other finite collections.

Exact achievement names, thresholds, icons, visibility, and availability are **separate content still to be populated**. Menu data may carry spirit/style/ingredient classifications to support conditions. Do not fabricate chemistry, ounces consumed, or classifications for generic/unlisted drinks.

### 8.3 End-of-cruise reveal

At the Day 7 **6 PM** transition, **all** achievement titles, conditions, and relevant icons become public—*including unearned secrets and regular achievements whose joke names were previously hidden*. Earned, unearned, exclusive/claimed-by-other states remain visually distinct. Whether the eventual creative catalog includes estimates such as an inferred spirit count or hypothetical reference ounces remains **content work**, not a new UX or engine requirement. Never depict approximations as measured alcohol intake, and do not invent consumption-racing rewards.

---

## 9. End of cruise — Awards Mode and Cruise Wrapped

**Related audit:** Q159–Q178, Q161–Q163, Q171–Q177, Q218.

### 9.1 Cutoff and navigation

- At **6:00 PM ship time on Day 7**, both games stop accepting **all new activity submissions (including zero-point drink logs)**; **no grace beyond 6 PM**. A request received by the server **before** cutoff remains valid if processing finishes afterward; the server-received time, not the time the phone began editing, decides acceptance. If the deadline passes during an unfinished form, show **“The games have ended!”** and route the player to Awards after acknowledging it. All old Log and challenge submission entries cease to be active; replace the four-tab nav with **three destinations: Wrapped/Awards, Gallery, Achievements**.
- Final standings and the full achievement reveal are accessible. Both games have their own Awards Mode in their own theme, scope, and scoring system.
- No fake live bounties in Awards Mode. Previously submitted Gallery photos and reactions remain browsable.
- A player enrolled in both games still has the top-right game switch and can visit each game's corresponding Awards Mode. A player in one game cannot view an unassigned game's Wrapped. The **Awards/Wrapped screen becomes Home**; if a player is reading a Gallery photo or achievements at exactly 6 PM, do not forcibly interrupt their current viewing.
- **Scores and achievements are frozen at the finale.** **No admin voids or corrections after 6 PM**, and no late submissions. Reactions and photo downloads may continue in the read-only-results experience, as they do not award points.

### 9.2 NEW single pre-reveal start screen

The latest organizer mockup **supersedes** the older mystery-tile-per-stat concept.

1. When a player first opens Wrapped after 6 PM, show the clean **pre-reveal invitation**: short intro/teaser copy and one large **“See My [game] Wrapped” / Start** button. Use the provided aqua-background mockup as visual reference.
2. Tapping the button transitions to **the full static Wrapped screen**, not a sequence of individual View-button reveals. Personal statistic cards and group award cards are fully visible there.
3. **Remember that the owner has started Wrapped**, so repeat visits open the completed static results directly. A **small one-time celebratory transition** after Start is welcome, along with light momentary animation on achievement popups elsewhere; no looping, audio, video, elaborate flip sequence, or separate mandatory card reveals.
4. The three-tab Awards Mode pill is visible as in the new mockup. The two games use the same layout templates with their own statistics and colors.

### 9.3 Results content patterns

- Personal result card — **icon → large number/ratio → short explanatory label → short fun sentence**.
- Personal named result card — **type/stat chip → large name/word → explanatory label → quip**.
- Shared full-width award card — **icon → fun award title → winner(s) → statistic that earned it → short quip**.
- True multi-entry rankings can reuse the existing leaderboard card style. No charts/timeline/map/system of new visualizations is required.
- Tied scores and Wrapped categories must show **all tied winners**, allowing multiple lines without tiny fonts. Nobody loses a tie on a hidden timestamp rule.
- Empty numeric stats show **0** (as explicitly directed), not a fabricated outcome; an award nobody earned can show “No winner” rather than pretend everyone tied at zero.
- Exact statistical categories, award names, and funny copy are **separate future content**. Drink It! and Ship It! have distinct competition winners and group summaries; results must never merge their points.
- The full final leaderboard should remain available inside/near the Wrapped experience using already-designed leaderboard components.

---

## 10. Organizer/Admin behavior

**Related audit:** Q001–Q002, Q009, Q179–Q189, Q207–Q209, Q227–Q228. Latest decisions supersede earlier admin proposals.

- A small, private Admin area is available only from the organizer's bottom-of-Home **Admin** link. No separate Figma mockup is required; reuse established controls and current-game visual language.
- Manage pre-created accounts: create player, choose/reset credentials, enable/disable game membership, assign one fixed Ship It! team, view roster/team memberships. Removing game participation does not wipe historical results. No self-service registration, automated recovery, or “Contact Josh” feature.
- **Void Submission** (before the finale only) is an emergency action for a genuinely invalid Drink It! log or Ship It! completion. Confirm clearly; update points, leaderboards, team challenge availability, dependent achievements/exclusive Firsts, and public Gallery records. **Do not offer editing** of posted captions/photos or past claim toggles; no routine approval queue. **Disable voiding after Friday 6 PM.**
- **Add Drink:** Organizer can add a new named drink with bar(s) and ingredients. Such entries can support future Ingredient Bounties and ordinary logging, but **never enter the preselected Cocktail Bounty rotation**. A simple admin action can also remove a mistaken player-added bar/drink/ingredient association. No general user menu editor.
- **Skip Current Cocktail Bounty / Skip Current Ingredient Bounty**: admin-only emergency control, with a visible remaining-replacement count determined by unused reserve inventory, not a separate quota. Require confirmation. Draw a **random unused** replacement from the correct pool; replace the shared currently active offer immediately **for the remainder of the same time slot** (e.g. skip at 2:37 PM → replacement expires at 3 PM, with its normal 15-minute private grace). Do not alter future preallocated slots or their boundaries; no repeats. The skipped offer is removed from future circulation. **Already awarded points remain intact.** Do not create a special new claiming grace or historical fallback for the retired offer. The replaced slot's identity/history is retained for audit, but no routine player-visible history is needed. Cannot skip Bar or Daily. If reserves are exhausted, disable the action and explain why.
- No arbitrary admin bonus points, test-cruise reset button, delegated admins, photo moderation queue, mass messages, manual retroactive bounty edits, or post-finale score adjustments. Development rehearsal/reset is handled outside the live admin UI.

### 10.1 Ship Clock and optional seven-day schedule

- One **central authoritative Ship Clock** drives all players' game-local displayed time, daily deadlines, rotating bounty slots, hidden grace, and Friday 6 PM finale. The server's absolute timeline remains the basis of submission order and exclusive-First timestamps. Never use an individual device's time zone, phone-local auto-offset, port geolocation, or route API as the scoring clock.
- Configure a starting Ship Clock before departure. In Admin, show **Current Ship Time** and offer manual **−1 hour / +1 hour** adjustments, with a correction to a specified displayed time as an emergency fallback. Show a preview/confirmation before applying. Everyone sees the correction consistently.
- Admin may optionally configure **seven cruise-day adjustments**, each relative to the prior day's clock: **−2, −1, 0, +1, or +2 hours**. The schedule runs automatically **once per configured cruise day at 3:00 AM ship time**. These are tentative choices, editable before or during the cruise; not a port/itinerary prediction service. An adjustment must never execute twice because a backward shift makes the displayed hour repeat.
- **Manual corrections are authoritative.** Scheduled future daily changes can still add their intended incremental shifts, but an automatic transition must **not undo** an organizer's manual correction. Admin can amend later scheduled changes at any time and can disable automatic changes if desired.
- Updating the Ship Clock **does not reshuffle the fixed time-slot bounty identities, reset people's claims, reorder real-world submission timestamps, invalidate completed achievements, or accidentally reopen a closed/finalized cruise day**. The calendar assignment remains **Saturday Day 1 → Friday Day 7**. Clock transitions are overnight specifically to avoid shifting noon–11 PM bounty windows.
- Showing the time in the admin UI is a diagnostic; the same centralized clock governs the actual game. Ship's announced time changes may be configured in advance and corrected by the organizer overnight as needed.

---

## 11. Errors, unexpected data, and reliability

**Related audit:** Q040, Q065–Q080, Q086, Q105, Q183–Q203, Q219–Q223, Q230.

| Scenario | What the player sees / what happens |
|---|---|
| **A saving request fails or connection drops** | Remain on the current Review/submission step; retain everything in the open page; clear modal explaining failure and **Retry**. No false success or blank form. |
| **Server accepted submission but reply was interrupted** | A retry resolves to that **same successful entry**; must not create duplicate points, photo activity, or achievements. |
| **Slow photo upload** | Loading/busy state, only one active submit, and no ability to accidentally award twice by tapping. |
| **Required photo missing (Ship It!/Daily)** | Clear photo-required notice; Submit can't succeed without one. Normal Drink It! photo may be skipped. |
| **Unsupported or large photo** | Simple error explaining what to change while preserving selections. Common iPhone photo formats should work; **compress/optimize where practical**, without a new editing workflow. |
| **Player intentionally navigates away** | Keep Editing / Exit-and-discard prompt, no persistent saved draft, no unannounced score. |
| **Player temporarily backgrounds Safari** | Keep the form in the active tab/session when the browser preserves it. If Safari fully closes/discards the page, draft persistence is not guaranteed. |
| **Gallery/list refresh fails** | Preserve already visible content; show nonblocking Retry; do not replace it with fake posts or zero scores. |
| **Bounty data cannot load** | Show that current data is unavailable/stale with Retry; do not guess which bounty is active or issue points on unverifiable data. |
| **Bounty becomes invalid during Review** | Explain it; keep the ordinary drink details and permit a valid remaining claim or zero-point log. Hidden grace still applies where relevant. |
| **Featured cocktail not offered onboard** | No compulsory report or automatic points. Try the prescribed source if available, or skip it; the admin's limited emergency rotation-skip option may exist. |
| **Named drink contains ingredient not recognized** | Use the **ingredient mismatch link** on Review → Yes/No honor confirmation → make Ingredient Bounty claimable and enrich the shared bar-specific drink ingredient catalog for future logs, subject to other eligibility rules. |
| **Unlisted named menu drink** | Minimal name/type entry; if relevant, honor confirmation for Ingredient Bounty; no recipe homework. |
| **Two teammates submit same scavenger challenge** | One team score; second gets “already completed,” not double credit. |
| **A pre-finale post/achievement is revoked** | Remove or update invalid public result, revise leaderboard/awards, and reopen eligible scavenger task if appropriate. No void/revision after Friday 6 PM. |
| **Exactly 6 PM Day 7 passes mid-upload** | If server received the submission before cutoff, honor the save even if processing completes later. Otherwise reject all new submissions (scored or unscored), explain the games ended, and offer Awards Mode. |
| **User opens from another device or long after last view** | Refresh authoritative current scores/bounties rather than assume old screen content is current. |

Errors use plain language: **what happened, what remains saved in this screen, and what the player can do now**. No raw network errors, permanent offline banners, background queue dashboard, technical stack traces, or support ticket links.

---

## 12. Visual and content handoff contract

**Related audit:** Q020–Q021, Q024, Q059–Q060, Q106, Q116, Q125–Q126, Q139–Q145, Q159–Q167, Q201–Q206.

- **Final Figma exports are visually authoritative.** The ZIP contains 15 images covering selection; Drink It! Home, log selection/review, achievements, popup, Gallery, Wrapped, Ship It! Home/challenges, and bounty states. Three later mockups update: (a) Ship It! leaderboard team-member names; (b) the Ingredient Bounty mismatch link beneath the bounty-toggle area; and (c) the single Wrapped pre-reveal start screen. The Review controls have **updated labels** reflecting default-selected bounties.
- The original style guide was a working document, but core constraints are established: **Drink It!** uses teal, magenta, cream/yellow, pale aqua; **Ship It!** uses blue, gold, cream/yellow, pale blue. Bricolage Grotesque for display and Figtree for body were the chosen families. The icon family for implementation is **Font Awesome**; reference glyphs are illustrative, not a binding selection.
- The interface must share visual component patterns between games, with **theme colors swapped**, not produce independently invented designs.
- Cards use rounded shapes, soft shadows, large touch targets, readable hierarchy, expandable descriptions/captions. Small phone width and iPhone notches/home indicator must not obscure header text, navigation, buttons, or the last scrollable item.
- **No new full-page Figma work is required by default.** Undesigned minor pages (Friends, Photo, Daily submission, Ship It! submission, login, simple error/popups, admin) adapt existing component patterns.
- **Mockup data is placeholder** unless separately finalized. Real cocktail tiers, ingredient availability, ships' bar/deck locations, 100–500-point scavenger categories, and actual achievements must come from reviewed content.
- If a technical requirement truly cannot be expressed using established visual patterns, **flag it for organizer design input**, rather than inventing a different visual language or a fifth navigation tab.

---

## 13. Pre-build acceptance journeys (behavioral, not implementation tests)

1. **One-game player enters:** chooses their username/password once → lands directly on their assigned game's Home → cannot access the other game.
2. **Two-game player enters:** sees launch choice at `/` → enters Drink It! → uses top-right swap → lands directly on Ship It! Home without a second login.
3. **Ordinary non-scoring drink:** choose bar, alcoholic beverage, companions optional, photo optional, review with zero selected claims → Submit Drink → new Gallery post, zero new leaderboard points.
4. **Single obvious bounty:** follow Cocktail Claim It, known bar/drink auto-selected, choose Drink It! companion, photo optional, Review preselects one eligible category, save → correct points and Gallery post.
5. **Multiple candidate bounties:** Review auto-selects all eligible rows; user can strategically deselect; a remaining unselected claim triggers the one-time “Proceed anyway?” warning before final save.
6. **Ingredient mismatch:** select a named menu drink containing current ingredient that data missed → tap mismatch link → confirm ingredient → auto-select/claim → save successfully without entering a recipe; future users of the same drink at that same bar benefit from the corrected ingredient association.
7. **Unlisted drink:** select bar → use My drink isn't listed → give name/type and ingredient answer if applicable → Friends/Photo/Review → safe save without adding to random Cocktail pool. Confirmed added ingredients on existing drinks are shared only for that bar/drink combination.
8. **Hidden grace:** a 2 PM cocktail is logged at 3:08 PM → its claim is still recognized even while 3 PM card is publicly active; the same claim at 3:16 PM no longer scores.
9. **Closed board and ordinary logging:** at 11:05 PM board says See You Tomorrow, but a regular drink can still be logged; a valid final-slot matching bounty can still be claimed through 11:15 PM.
10. **Daily Challenge:** player opens dedicated event task, uploads required picture without friends/bar fields, reviews, submits → exactly 50 points for that player, not for the entire group.
11. **Two teammates race:** teammate A completes same Ship It! item as B → team scores once and the second attempt sees Already Completed. A different team may still complete it.
12. **Gallery:** Everyone includes posts/awards within current game only; My/Team scopes accordingly; lazy loading shows skeleton and end-of-posts; reactions change between ❤️ 😂 🤙 one at a time.
13. **Gallery/achievement dots:** another player's new Gallery post triggers Gallery dot; visiting Everyone clears it. A new personal/team achievement triggers achievement dot until its collection is viewed.
14. **Achievement reveal:** one or several awards from the submission show one popup over Gallery; See Them navigates to My Achievements; dismiss stays in Gallery; secret titles remain hidden on other unearned cards.
15. **Failure and retry:** a photo upload fails after Review → no post/points yet, form retained, Retry → one result only, even if first request actually reached the server.
16. **Day 7 finale:** at precisely 6 PM all submissions close, three-tab Awards Mode appears, all secret achievement details become public, personal Wrapped start screen transitions to stat cards, ties show shared champions.
17. **Admin correction:** organizer revokes an invalid Ship It! completion or wrong Drink It! log → points, standings, Gallery, and dependent exclusive awards become correct.
18. **Admin skip:** emergency skip of an unavailable current Cocktail/Ingredient offer replaces only that slot with an unused reserve, keeps its time remaining, preserves already-awarded points, and does not edit fixed Bar/Daily.

---

## 14. Content and configuration needed before real play (not UX blockers)

These items are **not undecided UX mechanics** and should not stop work on the technical spec:

- Final retained Cocktail Bounty pool, designated single bar per cocktail, point tiers, menu ingredients, and **curated plain-English ingredient glosses** where useful (`Cointreau (orange liqueur)`, `Grey Goose (vodka)`). Do not guess brand classifications for unknown labels.
- Final normalized Ingredient Bounty pool and rankings, fixed pre-cruise points, and known-bar coverage display counts. An onboard correction does not retroactively change the rarity tier or curated display count.
- Seven fixed Bar Bounty assignments and seven Daily Challenge texts/requirements.
- Verified 50 Ship It! challenge descriptions and 100–500 point categories; replace any legacy video-or-photo task with **photo-only** wording.
- Exact sailing dates, roster, credentials, fixed teams, and an initial/preplanned **Ship Clock adjustment schedule** (can later be manually adjusted).
- Creative achievement catalog (names, criteria, counters, secrecy, exclusivity, any estimated spirit-related metrics) and Wrapped statistic/award content. The reusable behavioral/condition families should be built before those lists are finalized. Consider avoiding achievement incentives that reward rapid or excessive consumption when the actual creative content is authored; no such list is fixed now.
- Pre-departure development testing and resetting production data through engineering tools; no live Admin reset button.

---

## 15. Final consistency audit — resolved decisions and technical handoff

**Status: All formerly open UX decisions TBD-01 through TBD-13 are resolved.** There are no remaining **UX behavior** choices in this handoff. The following statements supersede old notes and the original numbered audit wherever necessary:

| Prior TBD | Approved resolution |
|---|---|
| 01. Ship time | Central Ship Clock; admin manual correction; optional seven-day planned daily offsets at 3 AM; absolute timestamps retain real submission ordering. |
| 02. Bounty skips | Admin can replace current shared Cocktail/Ingredient from unused reserves without restarting the slot. No separate quota, no rescoring past awards, no extra grace for skipped objective. |
| 03. Missing ingredients | Yes to player-confirmed, shared, **bar-specific** drink/ingredient corrections. Admin can remove erroneous associations. No retroactive effects on past logs or rarity ranking. |
| 04. Multi-eligible defaults | **All** eligible, unused Cocktail/Ingredient/Bar categories start selected; warn if any remain deselected on Submit. |
| 05. Editing | No post-submission editing for anyone. Admin can **void**, not edit, invalid entries **before** finale only. |
| 06. Account/Admin | Tiny Log Out and organizer-only Admin links in bottom-of-Home account section; small top-right switch for dual-game members; no Account page. |
| 07. Photo crop/download | Square previews only; retain optimized uncropped downloadable image. Ship It! and Daily photos required; ordinary Drink It! photo optional. |
| 08. Achievement dot | Independent from Gallery; clears only when My Achievements is opened, not when popup is dismissed. |
| 09. Hidden progress | Show unexplained X/Y on secret achievements that have legitimate numeric thresholds; omit for binary secrets. |
| 10. Estimated alcohol metrics | Creative catalog remains future content. Never imply estimated ounces are measured; creative content in that area is not finalized and must not be invented by Cursor. |
| 11. Post-final corrections | None. Final results freeze Friday 6 PM Ship Time; no late submissions or admin voids. |
| 12. Ingredient glosses | Curate understandable parentheses for supported known brands/liqueurs; content task, not a new design or algorithm. |
| 13. Featured Cocktail bar | Cocktail Bounty requires its **one designated bar**, even if the drink name exists elsewhere. The older master-rules permissive location wording is superseded. |

### Handoff requirements for the technical specification

- Treat this UX spec, the **reconciled** Master Game Rules, and final Figma/mockup exports as controlling sources, each in its proper domain. Do not base implementation on older audit proposals that conflict with these decisions.
- Translate each accepted behavior into an observable test: actual ship-clock slots, manual overrides, 15-minute grace and Friday hard cut-off, shared admin skips, atomic/idempotent submissions, bar-specific ingredient enrichment, one-per-category-per-day claims, team-once scavenger scoring, achievement exclusivity and revocation (before cutoff), notification-dot clear conditions, 5-at-a-time Gallery loading/new-post indicators, and final Wrapped reveal.
- Engineering may choose database, hosting, auth, image transformations, caching/polling cadence, and deployment method. It **may not** invent extra user steps, unsanctioned post edits, a fourth Awards tab, public registration, mandatory photo for normal drink logging, background offline queues, or an alternate scoring clock.

**UX baseline approved; technical and UI-content specifications are included in the same handoff.**


---

## 16. Saturday menu audit, catalog replacement and emergency pause (approved after UX v1.0)

### 16.1 Operational menu audit

The organizer may assign family members to photograph onboard bar menus and holiday specials before starting Drink It! or early on Saturday. This is an **off-app organizational process**: no in-app menu-scanning, photo-to-recipe AI, or participant scouting workflow should be implemented. If menus are close, use the initial catalog and narrow existing correction tools. If not, the external Menu Reconstruction Agent combines photographs of changed bars with unchanged-bar data and exports a **complete replacement game dataset plus a separate human-readable uncertainty report**. Unphotographed bars retain old data and are marked unverified; no invented ingredients, prices, drinks or bar availability.

Admin provides **Export Current Game Data → Import Replacement JSON → Preview/Validate → Publish**, with a guarded menu-only rollback. One deliberate replacement can rebuild **future unshown** Cocktail and Ingredient pools using verified newly discovered drinks; ordinary Admin Add Drink never silently adds a drink to the Cocktail rotation. Do not rewrite history, awarded points, completed rotations, or existing Gallery posts. Current bounty remains until its normal end unless the organizer separately skips it.

### 16.2 Pause/Resume Drink It!

- A single organizer-only **Pause Drink It!** control temporarily blocks **all Drink It! player submissions and claims**, including unscored logs and Daily Challenge, and communicates a straightforward pause message on Home. Gallery, scores, achievements and existing photos remain accessible. **Ship It! remains fully operational.**
- **Resume Drink It!** is a separate manual action, requiring explicit organizer confirmation. Do not auto-resume at a guessed time. The normal current Ship Time slot is used after resume; missed slots cannot be claimed retroactively.
- The pause does **not** extend game hours, rewrite past slot exposure, roll back the clock, or move the final Friday 6 PM cutoff. Paused windows never made playable remain eligible as unused reserves if supported by the schedule rules.
- A form blocked at submit by pause should retain in-memory selections and photo for Retry after resume, without adding persistent draft infrastructure.
- Organizer can export, import, validate, and publish the corrected catalog while Drink It! is paused. Admin may pause before the initial noon opening.

### 16.3 Boundaries

No general menu CMS, no in-app AI processing, no player review queue, no Git/CI deployment for data changes, and no automatic resync to individual phone clocks. The strict import/schema/replay requirements live in `03-Technical-Spec.md`.
