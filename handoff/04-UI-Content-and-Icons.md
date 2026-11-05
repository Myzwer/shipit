# Star Princess Games — UI Content, Copy & Iconography Specification

**Version:** 1.0 — initial implementation copy accepted by organizer; minor wording may be revised during visual QA  
**Prepared:** November 4, 2026  
**Games:** **Drink It!** and **Ship It!**  
**Purpose:** Supply the *exact reusable interface words and standard icons* so Cursor does not invent button text, errors, confirmations, headings, instructions, or icons while building the app. This is **not** the drink/ingredient catalog, scavenger challenge list, daily challenge catalog, creative achievement list, or Wrapped award data.

**References, in authority order:** (1) explicit organizer decisions recorded in these consolidated documents; (2) `01-Game-Rules.md`; (3) `02-UX-Behavior.md`; (4) `03-Technical-Spec.md` for operational capabilities; (5) provided mockups for composition and styling. This content spec controls **UI wording and recurring icon assignments only**, and must never silently alter gameplay or behavior. Where an existing screenshot contains older placeholder labels (e.g., **Social Feed**, **Tap to Claim**, old Wrapped **View** buttons), use the superseding words below. Re-rendered mockups may further settle display copy without changing behavior.

> **Review status:** Most entries are proposed wording implementing already-approved behaviors. This is a copy-review deliverable, not a request to reconsider the UX. The rules are derived from approved gameplay; creative wording is proposed. See **Final review checklist** at the bottom.

---

## 1. Editorial principles

1. **Error and recovery messages: clarity first.** Say what happened, whether the on-screen information is still present, and what to do. No jokes, metaphors, or technical jargon when something fails.
2. **Default tone: warm, concise, and practical.** This is a family cruise game. Friendly phrases are welcome, but the achievements and final awards deliver most of the comedy. Avoid forced puns and joke-everywhere writing.
3. **Rules: plain-English first, small personality only after the rule is clear.** No hidden conditions in a joke or a tooltip. Do not imply rules not in the master document.
4. **Describe actions, not implementations.** Players never see “RPC,” “transaction,” “HTTP,” “JSON,” “RLS,” “cron,” “idempotency,” or “database.”
5. **Prefer recognizable labels.** Buttons use verbs (`Submit Drink`, `Retry`, `Continue`); statuses use simple states (`Selected`, `Claimed`, `Unavailable`).
6. **Accessible to a mixed-age group.** Short sentences, comfortable wording, generous labels, and no reliance on color/icon alone. Avoid tiny text to fit an arbitrary single line.
7. **Consistency.** Always say **Drink It!**, **Ship It!**, **The Gallery**, **Ship Time**, **Bounty**, **Daily Challenge**, **Wrapped**, **Achievement**, **Team**. Never show “Cruise It!”, “Social Feed”, “Claim Drink” as a saved action, or “Tap to Claim” on Review.
8. **No fake content.** Dynamic items are placeholders in this spec, written as `{drinkName}`, `{barName}`, etc. Never fill production screens with example drinks, dummy achievement names, fake people, or invented holiday cocktails.
9. **No time-zone jargon on player screens.** Show countdowns and times using the centrally managed Ship Clock. “Ship Time” may be used when clarification helps; never encourage relying on the phone's time zone.
10. **No claims about the future.** Never show a success screen before the server confirms save; never promise an upload completed if the response is uncertain.

### Capitalization and formatting

- **Game names:** `Drink It!`, `Ship It!` (retain punctuation); **The Gallery** for the page heading, **Gallery** for accessible tab label.
- **Title case:** main headings, accordion titles, buttons, named bounty categories. All-caps may be supplied by the design CSS, not stored as separate uppercase words in the copy registry.
- **Points:** `{points} Points` in badges/cards and `{points} pts` in compact scoreboard contexts, consistent with the final mockup's available width. **Do not confuse displayed examples with the real point data.**
- **Times:** `12:00 PM`, `6:00 PM` (ship time), `2h 10m` when long, `12:34` for short live countdowns. Use actual Ship Clock schedule/data for the numbers.
- **Pluralization:** `1 New Post` / `{count} New Posts`; `1 Achievement Unlocked` / `{count} Achievements Unlocked`; `1 Point` / `{points} Points` where needed.
- **Do not show false data:** use `—` or an explicit unavailable state during failed loads, not 0. Genuine zero statistics in Wrapped **do** show `0`.

---

## 2. Global navigation, identity, and login

| Key / location | Exact visible text | Notes |
|---|---|---|
| Game selection headline 1 | `DRINK IT!` | Design may style in uppercase. |
| Game selection headline 2 | `SHIP IT!` | Design may style in uppercase. |
| Game selection action (each) | `Launch` | Goes to selected game. |
| Primary nav item 1 | `Home` | Icon-only nav: **accessible** label, tooltip optional; visible icon per mockup. |
| Primary nav item 2, Drink It! | `Log a Drink` | Icon-only nav action; equivalent to Plus. |
| Primary nav item 2, Ship It! | `Challenges` | Icon-only nav action; equivalent to Plus. |
| Primary nav item 3 | `Gallery` | Icon-only tab; visible page title **THE GALLERY**. |
| Primary nav item 4 | `Achievements` | Icon-only tab. |
| Awards nav item 1 | `Wrapped` | Awards Mode, replaces Home/Plus with 3-tab nav. |
| Awards nav items 2–3 | `Gallery`, `Achievements` | Both remain available. |
| Game switch button | *Icon only* | Accessible: `Switch to Ship It!` or `Switch to Drink It!`, based on destination. Visible only for players in both games. |
| Back button | *Icon only* | Accessible: `Go Back`; in wizard, goes one step back. |
| Close button | *Icon only* | Accessible: `Close`. |
| Account section title | `Account` | Bottom of Home, below rules. |
| Account identity | `Signed in as {playerName}` | Read-only. |
| Ship It! account team | `Team: {teamName}` | Read-only. |
| Account logout | `Log Out` | No confirmation. |
| Organizer only | `Admin` | Link in Account section, not a new player tab. |

**Login screen** (dropdown, never free-text name):

| Element | Exact visible copy |
|---|---|
| Heading | `Welcome Aboard` |
| Name field label | `Who are you?` |
| Name picker placeholder | `Select your name` |
| Password label | `Password` |
| Primary CTA | `Log In` |
| Submitting state | `Logging In…` |
| Incorrect credentials | `That name and password didn't match. Please try again.` |
| No user selected | `Select your name to continue.` |
| Password missing | `Enter your password to continue.` |
| No games enabled | `You aren't enrolled in either game. Ask the organizer if you think this is a mistake.` |
| Session expired | `Your session has ended. Please log in again.` |
| Game no longer allowed | `You no longer have access to {gameName}.` |
| Login network failure | `We couldn't log you in. Check your connection and try again.` |

**No** sign-up, Reset Password, Contact Organizer button, account-settings page, or profile editor. Password resets happen through organizer-managed accounts; a plain-text reminder is acceptable if already approved, but do not add a support workflow.

---

## 3. Home pages and scoreboard text

### Drink It! Home

| Element | Exact copy / template |
|---|---|
| Main section header | `Daily Bounties` |
| Cocktail card heading | `Cocktail Bounty` |
| Ingredient card heading | `Ingredient Bounty` |
| Bar card heading | `Bar Bounty` |
| Daily card heading | `Daily Challenge` |
| Cocktail tier label | Dynamic tier name: `Familiar`, `Interesting`, `Unusual`, `Adventurous` |
| Ingredient tier label | Dynamic tier name: `Easy to Find`, `Less Common`, `Hard to Find`, `Elusive` |
| Cocktail venue detail | `Location: {barName}` |
| Ingredient coverage | `Available at {barCount} {barOrBars}` | The count is curated catalog metadata; **never list the hidden bar names**. |
| Bounty time left | `Time Remaining` |
| Fixed daily available window | `Available until {time}` |
| Open bounty action | `Claim It` | Goes to appropriate flow; **never immediately awards points**. |
| Claim recorded state | `Claimed` |
| Claim details | `{points} Points Earned` | Show awarded points, not hypothetical current group points. |
| Closed overnight | `See You Tomorrow` |
| Pre-opening | `Game begins at 12:00 PM` |
| Countdown before initial/day opening | `Opens in {countdown}` |
| Leaderboard heading | `Leaderboard` |
| Leaderboard primary metric | `{points} Points` |
| Leaderboard count | `Bounties {claimedCount}/28` |
| No standings yet | `No points yet. The leaderboard will update as bounties are claimed.` |
| Current-day no eligible claims left | `You've claimed all your bounties for today.` | Informational only; regular drink logs remain permitted. |

**Important states:** The claimed card can temporarily reveal the current live bounty on tap, as approved, but the visible primary label remains `Claimed` when closed. Do **not** advertise the hidden 15-minute claim grace anywhere on Home or in the rules. At 11 PM, public cards close even though the hidden courtesy period may still be relevant to Review. Outside bounty hours, ordinary Drink It! logging remains available before Friday's 6 PM finale.

### Ship It! Home

| Element | Exact copy / template |
|---|---|
| Main heading | `Home` |
| Team progress heading | `{teamName}'s Progress` | Correct apostrophe display; an apostrophe-ending name may use natural readable punctuation. |
| Team count | `{completedCount}/50 Challenges` |
| Team points | `{points} Points` |
| Category progress | `{completedCount}/10` |
| All category link | `All Challenges` |
| Leaderboard heading | `Leaderboard` |
| Leaderboard completion count | `Challenges: {completedCount}/50` |
| Leaderboard team members | `{memberOne} · {memberTwo} · {memberThree}` | Dynamic roster, never hard-code three players. Wrap when needed. |
| No team progress | `No challenges completed yet. Pick one to get started!` |

**Tie behavior** has no special explanatory prose; equal ranks display the same number and retain the established incumbent ordering. Scoreboards **do not** count unscored drink logs as bounties.

---

## 4. Drink It! — logging wizard

### Shared wizard labels

| Location | Exact copy |
|---|---|
| Screen header | `Log a Drink` |
| Progress steps | `Bar` · `Drink` · `Friends` · `Photo` · `Review` |
| Previous step | `Back` *(may be icon only; accessible label required)* |
| Explicit departure | `Exit` |
| Save loading label | `Submitting…` |
| Final CTA | **`Submit Drink`** |

### Step 1: Bar

| Location | Exact copy |
|---|---|
| Prompt | `Where are you?` |
| Sort label | `Sort by` |
| Sort choices | `Alphabetical`, `Deck` |
| Row deck metadata | `Deck {deckNumber}` |
| Empty data | `Bars aren't available right now. Try again.` |

Sort-by-deck means low deck to high deck; selecting a bar advances automatically.

### Step 2: Drink

| Location | Exact copy |
|---|---|
| Prompt | `What are you having?` |
| Search placeholder | `Search drinks` |
| Generic item | `Beer` |
| Generic item | `Wine` |
| Generic item | `Other Alcoholic Beverage` |
| Missing catalog link | `My drink isn't listed` |
| Search empty state | `No drinks found. Try another name or use “My drink isn't listed.”` |
| No drinks at bar | `No drinks are listed for this bar yet. You can still log an alcoholic drink.` |

Do **not** show ingredient lists or ingredient search in the normal picker. Generic Beer/Wine/Other do **not** silently qualify for Cocktail or Ingredient Bounties; they may qualify for Bar Bounty when its rules are met. Do not add nonalcoholic choices.

### Step 2A: Missing named drink

| Location | Exact copy |
|---|---|
| Heading | `Add an Unlisted Drink` |
| Introduction | `If it's on the current bar menu but missing here, you can still log it.` |
| Drink name label | `Drink name` |
| Drink name placeholder | `Name on the menu` |
| Type label | `Drink type` |
| Type choices | `Cocktail`, `Beer`, `Wine`, `Other Alcoholic Beverage` |
| Active ingredient question, if relevant | `Does this named menu drink contain {ingredientName}?` |
| Ingredient confirmation helper | `Only select Yes if the ingredient is part of the drink as served on the menu.` |
| Confirmation choices | `Yes`, `No` |
| Action | `Continue` |
| Missing name validation | `Enter the drink's name to continue.` |

This is a simple fallback, **not** a full menu editor. If a missing featured Cocktail Bounty drink is confirmed at its **designated** bar, its bar-specific eligibility may be handled under approved rules. No arbitrary off-menu concoctions qualify for the Ingredient hunt.

### Step 3: Friends

| Location | Exact copy |
|---|---|
| Prompt | `Who are you with?` |
| Selectable list helper | `Select anyone from Drink It! who's with you.` |
| No eligible companion helper | **`Must be with someone else to log a bounty.`** |
| Zero-person continuation | `Continue` |
| Empty roster | `No other Drink It! players are available to select.` |

The user may continue with nobody selected and make an ordinary zero-point drink log. Don't block the form or launch a warning modal. An eligible companion is necessary for all **drink-based** bounty claims; Daily is a separate flow.

### Step 4: Photo and caption

| Location | Exact copy |
|---|---|
| Heading | `Add a Photo` |
| Optionality (ordinary Drink It!) | `Optional — you can log your drink without a photo.` |
| Camera/file action | `Add Photo` |
| Replace action | `Change Photo` |
| Remove action | `Remove Photo` |
| Caption label | `Caption (optional)` |
| Caption placeholder | `Anything you'd like to add?` |
| Crop helper | `Gallery previews are square, so keep your subject near the center. Your full photo will still be available.` |
| Forward action | `Continue` |

One image max. Do not introduce a crop editor, multi-image upload, video input, or attachment types.

### Step 5: Review and bounty selection

| Location | Exact copy |
|---|---|
| Main title | `Review` |
| Summary labels | `Drink`, `Bar`, `With`, `Photo`, `Caption` | Labels may be visually implicit where mockups do not show them. |
| Empty companion summary | `Just me` |
| No caption | **`No caption provided`** |
| No photo | `No photo added` | Display designed branded placeholder preview. |
| Bounty selection heading | **`Your Bounties`** | Replaces obsolete **Tap to claim** heading. |
| Eligible preselected state | **`SELECTED`** |
| Selected helper | `Tap to deselect` | Optional subtle helper; selection state must already be visually obvious. |
| Eligible manually unchecked state | **`AVAILABLE`** |
| Unavailable state | `Unavailable` |
| Already claimed today | **`ALREADY CLAIMED`** |
| Ingredient mismatch link | **`My drink has the ingredient bounty but it's not available?`** |
| Ingredient mismatch modal title | `Confirm Ingredient` |
| Ingredient mismatch question | **`Does {drinkName} contain {ingredientName}?`** |
| Ingredient mismatch helper | `Confirm only if it's an ingredient in the drink served at {barName}.` |
| Ingredient mismatch choices | `Yes`, `No` |
| Submit CTA | **`Submit Drink`** |

**Behavior, not a new decision:** All eligible/unused bounty rows start selected. If none is selected only because the player manually unchecked at least one available row, show the confirmation below. Never show it for already-claimed or otherwise unavailable rows.

**Unselected bounty confirmation:**

- **Title:** `Unclaimed Bounty`
- **Body:** **`You have an unclaimed bounty available. Submit anyway?`**
- **Buttons:** `Keep Editing` / **`Submit Anyway`**

**Navigation/intentional exit confirmation:**

- **Title:** `Leave This Log?`
- **Body:** `Your drink hasn't been submitted. Leaving will discard your selections.`
- **Buttons:** `Keep Editing` / **`Exit and Discard`**

**Restart by tapping Plus mid-wizard:**

- **Title:** `Start Over?`
- **Body:** `This will discard the drink you're currently logging.`
- **Buttons:** `Keep Editing` / **`Start Over`**

---

## 5. Drink It! — Daily Challenge completion

**Important:** The real daily challenge text is separately supplied. This section defines only fixed interface wording. Every Daily Challenge submission needs **one photo**; companions are not selected through this flow.

| Element | Exact copy |
|---|---|
| Screen heading | `Daily Challenge` |
| Confirmation question | `Did you complete it?` |
| Photo step title | `Add Your Photo` |
| Photo helper | `A photo is required to complete today's challenge.` |
| Caption label | `Caption (optional)` |
| Review title | `Review Your Challenge` |
| Points line | `50 Points` |
| Final CTA | `Submit Challenge` |
| Loading | `Submitting…` |
| Already completed | `You've already completed today's Daily Challenge.` |
| Not available yet | `Today's Daily Challenge opens at 12:00 PM.` |
| Daily closed | `Today's Daily Challenge is closed.` |

The Daily Challenge details in the game data determine the precise event instructions, including any meeting time. Do not invent a default requirement to tag people, select a bar, log a drink, or have all players in the photo.

---

## 6. Ship It! — challenges and submission

| Element | Exact copy |
|---|---|
| Challenge list heading | `Challenges` |
| Filter label | `Filter by` |
| Filter default | `All` |
| Category options | **Exact category labels from the scavenger dataset**, not generated shortened names |
| Category progress | `{categoryName} — {completedCount}/10` |
| Category points pill | `{points} Points` | Must use real 100/200/300/400/500 values, not old screenshot placeholders. |
| Completed challenge state | `Completed` | Muted card, check; **not tappable**. |
| Challenge submission heading | `Submit Challenge` |
| Challenge details heading | `Your Challenge` |
| Team credit line | `Points go to {teamName}` |
| Photo label | `Add Your Photo` |
| Photo helper | **`Every Ship It! challenge needs a photo.`** |
| Caption | `Caption (optional)` |
| Review heading | `Review Your Challenge` |
| Final button | `Submit Challenge` |
| Submission loading | `Submitting…` |
| Team already did it | `Your team already completed this challenge.` |
| Team completed CTA | `Back to Challenges` |
| No challenges in filter | `No challenges in this category.` | Use only if data genuinely empty. |

Do not require “all team members must appear in every photo.” That is **not** a universal rule. The underlying challenge determines who must be present or pictured. A selfie is fine when it meets that challenge's requirements. One required photo only; no videos.

---

## 7. The Gallery

| Element | Exact copy |
|---|---|
| Page heading | **`The Gallery`** |
| Shared default filter | `Everyone` |
| Drink It! other filter | `My Gallery` |
| Ship It! other filter | `My Team` |
| Empty Everyone | `Nothing here yet. The first photos and updates will appear soon.` |
| Empty personal | `You haven't posted anything yet.` |
| Empty team | `Your team hasn't posted anything yet.` |
| New activity pill, singular | `1 New Post` |
| New activity pill, plural | `{count} New Posts` |
| Load more | `Loading More…` | Usually skeleton only, this is the accessible status text. |
| End of list | **`End of Posts`** |
| Photo open | *Tap photo* | Accessible label `View Full Photo`. |
| Photo save | *Icon only* | Accessible label **`Download Photo`**. |
| Photo close | *Icon only* | Accessible label `Close Photo`. |
| Missing ordinary Drink It! photo | Designed **Drink It! branded placeholder** | Never a stock or AI-generated fake cocktail image. |
| Achievement activity label | `Achievement Unlocked` |
| Optional Ship It! author line | `Submitted by {playerName}` |
| Post time | `{time} · Ship Time` or abbreviated ship-local timestamp consistent with mockup | No phone-local conversion. |
| Reactions | **`❤️` `😂` `🤙`** | Emoji are the reaction glyphs; do not replace `🤙` with thumbs-up or a Font Awesome icon. |
| Reaction accessible labels | `Heart`, `Laugh`, `Hang Loose` | Show count for each, select/change/toggle one reaction per user/post. |

**Gallery loading/freshness:** On fresh navigation the feed shows newest first and loads five at a time. If new items arrive while scrolled, show the New Posts pill without jumping the user's position. No comments, messages, usernames-as-links, or post editor. Reactions do not trigger notifications.

---

## 8. Achievements and their notifications

**Do not put creative achievement names, clues, jokes, thresholds, or artwork in this spec.** The future content catalog defines them. Generic UI copy only:

| Element | Exact copy |
|---|---|
| Page title | `Achievements` |
| Filters | `My Achievements`, `All Achievements` |
| Group headings | `Milestones`, `Firsts`, `Other` |
| Earned summary | `{earnedCount} of {totalCount} Achievements Earned` |
| Hidden funny title | `?????` |
| Secret placeholder description | `Secret Achievement` |
| Unclaimed First | `Available` |
| First won by another | `Claimed by {ownerName}` |
| Earned timestamp | `Earned {shipLocalDateTime}` |
| Empty My Achievements | `No achievements yet. Keep exploring!` |
| No qualifying numeric secret progress | *Do not show counter* |
| Secret with valid counter | `{current}/{target}` | No explanatory text revealing requirement. |
| Single unlock modal title | **`Achievement Unlocked!`** |
| Multiple unlock modal title | **`{count} Achievements Unlocked!`** |
| Single unlock CTA | `See It` |
| Multiple unlock CTA | `See Them` |
| Dismiss popup | *Close icon/backdrop* | Accessible label `Close Achievement`. Dismiss goes back to Gallery. |

Public-but-unearned items reveal their plain requirement and progress but hide their humorous title. Earned items reveal their actual catalog-defined titles and icons. Secrets reveal details on unlock or at Friday finale. **Achievement dots** remain until My Achievements is opened—even if the unlock popup was previously seen. No notification center, toast backlog, or push notifications.

---

## 9. Awards Mode and Wrapped

| Element | Exact copy |
|---|---|
| Awards Mode navigation accessible name | `Wrapped` |
| Wrapped page heading | `Cruise Wrapped` |
| One-time introductory headline | **`Ready to see how you did?`** |
| Drink It! intro button | **`See My Drink It! Wrapped`** |
| Ship It! intro button | **`See My Ship It! Wrapped`** | Shows team-specific results; button belongs to current game. |
| Drink It! personal statistics heading | `Your Week at Sea` | Recommended fixed heading, not a creative award title. |
| Ship It! personal/team heading | `Your Team's Week at Sea` | Current team owns Ship It! results. |
| Group results heading | `Let's See How Everyone Else Did` |
| Final leaderboard heading | `Final Leaderboard` |
| No award winner | `No winner` |
| Genuine zero | `0` |
| Tied award winner display | `{winnerOne}, {winnerTwo}` *(or multiline)* | Never break an actual tie arbitrarily. |
| Finale message for invalid new submission | `The games have ended. New submissions are closed.` |
| Post-finale recovery CTA | `View Wrapped` |

The introductory copy may include one short supporting line: `The games are over. Your week at sea is ready to revisit.` This is not an achievement, award category, or statistical claim. Tapping the intro button reveals the **whole** Wrapped experience, not individual View tiles. On return, go straight to the revealed page. Small, one-time animation is welcome; nothing looped or audio-backed. All prior Gallery content, achievements, reactions, and photo downloads remain available.

**Important:** Specific Wrapped *statistic titles, award titles, superlative names, winner quips, and thresholds* are future **game content**, not to be invented in the UI implementation. The design shows the **templates** for those items. Likewise, no unsupported statistic should be fabricated to fill a blank card.

---

## 10. How to Play accordions — exact player-facing rules

**Placement:** Beneath the leaderboard/main game activity and **above Account**, on each game's Home page. Section header **`How to Play`**. Use one column of native accessible accordion/disclosure rows, closed by default. Rows may be opened independently. A player can read only a quick summary and ignore the fine print. No compulsory first-run tour, rules acceptance checkbox, or wall of text before playing.

### Drink It! quick visible summary

> **Earn points by completing bounties throughout the cruise.** There are four ways to score: Cocktail, Ingredient, Bar, and Daily Challenges. You can claim each type once per day. The player with the most points wins!

**Accordion: `The Basics`**

> **Play together.** For Cocktail, Ingredient, and Bar Bounties, you must be with at least one other person playing Drink It! when you order. Your companion doesn't have to order the same drink. Daily Challenges follow their own instructions.
>
> **You choose what to claim.** Any bounties your drink qualifies for are selected automatically when you log it. You can uncheck a bounty on Review if you'd rather save that category for later.
>
> **One drink can count for more than one bounty.** If it qualifies for multiple categories you haven't used today, you can earn all of those points with the same drink.
>
> **Regular logs are fine, too.** You can log drinks without claiming a bounty, including when you're on your own. Regular drink photos are optional.

**Accordion: `Cocktail & Ingredient Bounties`**

> **Cocktail Bounty:** Order the exact featured cocktail at the bar shown on the card. The featured cocktail changes every hour while bounties are open. More unusual drinks are worth more points (25–100).
>
> **Ingredient Bounty:** Find a named cocktail on a bar's menu that contains the featured ingredient. Ingredients change every two hours. The app shows how many bars may carry the ingredient, but finding one is up to you. Rarer ingredients earn more points (25–100).
>
> **Menu mismatches:** If an actual named menu cocktail is missing from the app, use **My drink isn't listed**. If its ingredient is missing in the app, use the confirmation link on Review. Don't add ingredients to a drink just to qualify.

**Accordion: `Bar Bounty & Daily Challenge`**

> **Bar Bounty:** Visit the featured bar and order an alcoholic drink with at least one other Drink It! player. Beer, wine, cocktails, and shots count. You get **25 points plus 10 for each additional eligible companion**, up to **95 points**. Someone who's already claimed that day's Bar Bounty doesn't increase your group bonus.
>
> **Daily Challenge:** Complete the day's activity and submit its required photo to earn **50 points**. Follow that challenge's directions; you don't need to select companions in the Daily submission form.

**Accordion: `Hours & Fine Print`**

> **Bounty hours:** Bounties open at **12:00 PM Ship Time** and close at **11:00 PM** on the first six days. On Friday, they end at **6:00 PM**. You can still log ordinary drinks outside bounty hours until the game ends Friday.
>
> **One claim per category per day.** Everyone sees the same current bounties, and someone else claiming one doesn't take it away from you. Rotating Cocktail and Ingredient Bounties aren't repeated during the cruise.
>
> **Honor system:** Log what you actually ordered and who was there. There's no teammate approval process for Drink It! claims.
>
> **Final submissions:** Check your selections before tapping **Submit Drink**. Saved entries can't be edited later.
>
> **The finish:** Both games end Friday at **6:00 PM Ship Time**, when Wrapped and the final results open. Achievements are for fun and do not add points.

**Do not disclose** the hidden 15-minute courtesy period, future rotations, other bars serving the featured Ingredient Bounty, or future mystery achievements in player-facing rules.

### Ship It! quick visible summary

> **Explore the ship and complete photo challenges with your team.** Each challenge earns points for the whole team, and the highest-scoring team wins. There are **50 challenges** across five categories.

**Accordion: `The Basics`**

> **One team, one score.** You're assigned to a team, and any team member can submit a challenge for that team. A challenge only counts **once per team**, even if several teammates take photos. Other teams can still complete the same challenge.
>
> **Find your next challenge.** Open Challenges, browse the five categories, and tap any unfinished challenge to submit it. Completed challenges appear checked and can't be submitted again by your team.

**Accordion: `Photos & Participation`**

> **Every challenge needs one photo.** You can take one or choose one from your phone. Photos are required; videos aren't part of this game. Captions are optional.
>
> **Follow each challenge's instructions.** Selfies are fine when they meet the challenge's requirements. If a challenge says certain teammates must participate or appear in the picture, make sure they do. **Not every challenge requires a photo of the entire team.**
>
> **Honor system.** Your team decides whether you've completed the task honestly. Photos count when submitted—there's no routine approval wait.

**Accordion: `Points & Progress`**

> **Harder categories earn more points.** Challenges are worth **100, 200, 300, 400, or 500 points**, depending on their category. Each category has ten challenges, for a maximum of **15,000 team points**.
>
> **Your team shares the progress.** When one teammate submits an eligible challenge, everyone on the team sees it marked complete and the team's points update.
>
> **Achievements are extras.** They celebrate discoveries and teamwork but don't add leaderboard points.

**Accordion: `Hours & Fine Print`**

> **Explore any time.** Unlike Drink It! bounties, Ship It! challenges can be completed throughout the cruise, including mornings.
>
> **Final submissions:** Review your photo and challenge before tapping **Submit Challenge**. Saved submissions can't be edited later.
>
> **The finish:** Ship It! closes Friday at **6:00 PM Ship Time**. The final standings and Wrapped open then. Tied teams share their finishing position.

**Do not** put unpublished challenge objectives, specific achievement conditions, roster-specific jokes, or photo requirements beyond the task descriptions into this fixed rules accordion.

---

## 11. Common confirmations and failure messages

### 11.1 User actions and warnings

| Event | Title | Exact body | Actions |
|---|---|---|---|
| Unclaimed eligible bounty on Submit | `Unclaimed Bounty` | `You have an unclaimed bounty available. Submit anyway?` | `Keep Editing` / `Submit Anyway` |
| Leave unfinished entry | `Leave This Log?` / `Leave This Challenge?` | `You haven't submitted yet. Leaving will discard your selections.` | `Keep Editing` / `Exit and Discard` |
| Start a fresh log while another is open | `Start Over?` | `This will discard the entry you're currently working on.` | `Keep Editing` / `Start Over` |
| Confirm missing ingredient | `Confirm Ingredient` | `Does {drinkName} contain {ingredientName}?` | `No` / `Yes` |
| Ship It! requires photo | `Photo Required` | `Add a photo before submitting this challenge.` | `Add Photo` / `Cancel` |
| Daily requires photo | `Photo Required` | `Add a photo before submitting today's Daily Challenge.` | `Add Photo` / `Cancel` |
| Expired selected bounty | `Bounty No Longer Available` | `This bounty expired before your drink was submitted. Your drink details are still here. Review the available options or submit it without this bounty.` | `Back to Review` |
| Already claimed category, e.g. in a stale form | `Bounty Already Claimed` | `You've already claimed today's {bountyType}. You can still submit your drink without it.` | `Back to Review` |
| Duplicate team completion | `Already Completed` | `Your team already completed this challenge. No additional points were awarded.` | `Back to Challenges` |
| Friday hard close mid-form | `The Games Have Ended` | `New submissions closed at 6:00 PM Ship Time. Your results are ready in Wrapped.` | `View Wrapped` |
| Drink It! paused mid-form | `Drink It! Is Paused` | `Drink logging is temporarily unavailable while the menus are checked. Your choices are still here. Try again after play resumes.` | `OK` |

**Required behavior:** Where the app can identify an expired claim before Submit, show the message before issuing a bad save. If some other valid bounties remain, keep them available. The hidden grace is implemented but not advertised or explained as an extra 15-minute ordering window.

### 11.2 Connection, upload, and save failures — NO jokes

| Situation | Title | Exact body | Primary action |
|---|---|---|---|
| Server response uncertain | `Submission Not Confirmed` | **`We couldn't confirm whether your submission was saved. Your selections are still here. Tap Retry to check and finish safely.`** | `Retry` |
| Confirmed save failed | `Couldn't Submit` | `Your submission wasn't saved. Your selections are still here. Check your connection and try again.` | `Retry` |
| Photo upload failed | `Photo Upload Failed` | `Your photo is still selected, but the upload didn't finish. Try again.` | `Retry Upload` |
| Photo format not supported | `Photo Not Supported` | `Choose a JPG, PNG, HEIC, or another supported photo format.` | `Choose Another Photo` |
| Image too large to process | `Photo Too Large` | `This photo couldn't be prepared for upload. Choose a smaller photo or try another one.` | `Choose Another Photo` |
| Connection lost before submit | `Connection Lost` | `You're offline. Your entries are still here. Reconnect and try again.` | `Retry` |
| Required data failed to load | `Couldn't Load Game Data` | `We couldn't load the current game information. Check your connection and try again.` | `Retry` |
| Gallery refresh failure | `Couldn't Refresh Gallery` | `We couldn't load the latest posts. Anything already on screen is still available.` | `Retry` |
| Reaction save failure | *Nonblocking text, no modal* | `Reaction not saved. Please try again.` | None required |
| Photo download failure | `Download Failed` | `We couldn't download this photo. Check your connection and try again.` | `Retry` |
| Not authorized to submit | `Access Changed` | `You no longer have access to {gameName}.` | `Go to Home` |
| Unknown error not safely classified | `Something Went Wrong` | `We couldn't complete that action. Nothing on this screen has been cleared. Please try again.` | `Retry` |

**Important technical content contract:** Never use the “wasn't saved” message if the backend cannot yet know whether it saved the submission. Use **Submission Not Confirmed** and the idempotent retry flow instead. If the player was successfully saved during a lost response, Retry must show the same successful result rather than resubmit and double-score.

### 11.3 Empty, loading, and disabled states

| State | Exact copy |
|---|---|
| Current game paused | `Drink It! is temporarily paused while we check the menus. Check back soon!` |
| Paused Home secondary line | `Your previous posts, scores, and achievements are still available.` |
| Paused administrator action (read-only for players) | `Logging resumes when the organizer reopens the game.` |
| Before the first Drink It! opening | `Drink It! starts at 12:00 PM Ship Time.` |
| Daily closed | `See You Tomorrow` |
| Drinks still loggable when bounties closed | `Bounties are closed right now. You can still log a drink without claiming one.` |
| Loading scores | `Loading Leaderboard…` |
| Loading challenges | `Loading Challenges…` |
| Loading Gallery | `Loading Posts…` |
| Loading achievements | `Loading Achievements…` |
| No Gallery activity | `Nothing here yet. The first photos and updates will appear soon.` |
| No earned achievements | `No achievements yet. Keep exploring!` |
| No eligible rotating replacement | `No unused replacements remain for this bounty.` | Admin only. |
| Input and button disabled by Friday finale | `The games have ended. New submissions are closed.` |
| Player not part of one game | `You aren't enrolled in this game.` |

---

## 12. Admin-only copy (short, functional, not playful)

**Scope:** Organizer-only Admin within the existing Vue app. No separate consumer-style dashboard or extensive content CMS. Text here is a proposed operator-facing contract; exact menu import field names must match technical schema.

| Admin area / control | Exact text |
|---|---|
| Home title | `Admin` |
| Roster section | `Players & Teams` |
| Add user | `Add Player` |
| Name field | `Player Name` |
| Password action | `Set Password` / `Reset Password` |
| Membership labels | `Drink It! Access`, `Ship It! Access` |
| Team assignment | `Ship It! Team` |
| Clock section | `Ship Clock` |
| Clock reading | `Current Ship Time` |
| Date/day reading | `Cruise Day {dayNumber}: {weekday}` |
| Clock adjustment controls | `−1 Hour`, `+1 Hour`, `Set Ship Time` |
| Clock apply | `Apply Time Adjustment` |
| Schedule heading | `Planned Time Changes` |
| Schedule status | `Automatic Schedule On` / `Automatic Schedule Off` |
| Schedule day option | `No change`, `−1 hour`, `+1 hour`, `−2 hours`, `+2 hours` |
| Pause action | `Pause Drink It!` |
| Resume action | `Resume Drink It!` |
| Pause state | `Drink It! is paused for all players.` |
| Live state | `Drink It! is running.` |
| Skip cocktail | `Skip Current Cocktail` |
| Skip ingredient | `Skip Current Ingredient` |
| Reserve counter | `{count} Replacements Remaining` |
| Add menu item | `Add Drink` |
| Correct player-added ingredient | `Remove Ingredient Correction` |
| Menu recovery | `Game Data` |
| Export | `Export Current Game Data` |
| Import | `Import Replacement Game Data` |
| Import check | `Validate & Preview` |
| Import publish | `Publish Replacement Data` |
| Roll back version | `Restore Previous Catalog` |
| Admin void | `Void Submission` |
| Diagnostics | `Game Status` |

**Confirmations and outcomes:**

| Action | Confirm title | Confirm body / message |
|---|---|---|
| Adjust Ship Clock | `Apply Ship Time Change?` | `This changes the shared Ship Clock for everyone. Previous submissions and scores will not change.` |
| Save future schedule | `Save Planned Time Changes?` | `These changes will apply to the remaining scheduled overnight adjustments.` |
| Pause Drink It! | `Pause Drink It!?` | `All Drink It! logging and scoring will stop until you resume. Ship It! will continue.` |
| Resume Drink It! | `Resume Drink It!?` | `Drink It! will reopen using the current Ship Time and active game data.` |
| Skip bounty | `Skip Current Bounty?` | `The current {bountyType} will be replaced from the unused pool. Its time remaining will not reset.` |
| Skip successful | *Nonblocking confirmation* | `Bounty replaced.` |
| No replacements | *Disabled with explanation* | `No unused replacements remain for this bounty.` |
| Import validation fails | `Import Can't Be Published` | `The file has validation errors. Review the issues below. No game data has changed.` |
| Publish replacement | `Publish Replacement Game Data?` | `Future menu and bounty information will use this file. Existing submissions and scores will remain unchanged.` |
| Publish complete | *Nonblocking confirmation* | `Replacement game data published.` |
| Restore prior catalog | `Restore Previous Catalog?` | `The previous catalog will be restored for future use. Existing submissions and scores will not be changed.` |
| Void submission | `Void This Submission?` | `This removes the submission and its scoring effects. Related achievements and team progress may change.` |
| Void after finale | *Disabled control* | `Submissions cannot be changed after the games end.` |
| Admin operation failed | `Change Not Saved` | `The change didn't save. Nothing was updated. Please try again.` |

Admin input/preview screens should show concrete real data and current status rather than trusting these generic strings to explain consequences. No automatic pause end-time estimate or “Contact Josh” CTA.

---

## 13. Font Awesome Pro: registry and icon assignment

### 13.1 Delivery method (important credential policy)

**Use the official Vue Font Awesome SVG component and Pro packages, not copied font files, a pasted API key, or a JavaScript CDN Kit loaded at runtime.** Install only needed icon styles and import only used icons. The organizer already has Font Awesome Pro.

- Prefer `@fortawesome/vue-fontawesome` (Vue 3 compatible), `@fortawesome/fontawesome-svg-core`, and the relevant Pro SVG package(s). For this small UI, **Pro Light** for standard outline controls plus **Pro Solid** for active/completed/emphasis states is a sensible starting pair. A consistent **Pro Regular** alternative is acceptable if Light renders too thin at actual mobile sizes. Match final re-rendered mockups over arbitrary personal taste.
- Install using Font Awesome's private registry and a **Font Awesome Package Token**, *not* the API token (these are different token types). Use an environment variable `FONTAWESOME_PACKAGE_TOKEN` locally and in Vercel build settings if production installation requires it.
- A safe **committable** `.npmrc` template (no literal token) is:

  ```ini
  @fortawesome:registry=https://npm.fontawesome.com/
  //npm.fontawesome.com/:_authToken=${FONTAWESOME_PACKAGE_TOKEN}
  ```

- Never place the token literal in `.npmrc`, `.env.example`, a README, this spec, a chat, source code, a committed text file, a generated asset, or any `VITE_` variable. Do not put the Font Awesome token in the deployed browser runtime. Use an untracked local environment variable and protected Vercel build environment variable. Do not log it in build output.
- The token only lets the package manager install the icons. It is **not** needed by players to view bundled SVG icons after the frontend is built.
- **No need to download all Pro webfont/desktop packs.** If private-registry setup becomes a real blocker, privately downloaded npm packages are an alternative, but keep licensed packages private and do not commit a full unneeded icon archive. Font Awesome has license restrictions around sharing Pro assets.
- Official documentation: https://docs.fontawesome.com/web/setup/packages and https://docs.fontawesome.com/web/use-with/vue/ . Check the current docs during implementation for the actual version's supported imports and Kit options.

### 13.2 UI icon registry — proposed semantic map

All icons are defined *once* in a centralized registry (for example `src/ui/icons.ts`), with semantic keys. The mapping below names **Font Awesome SVG icon slugs** rather than assuming exact code export variables in every package version. Cursor should verify each named glyph in the installed licensed version and only substitute if it is unavailable; record any substitute. **Do not vary a recurring semantic icon between the two games**; only theme colors change.

| Semantic key | Font Awesome icon | Default style | Usage and accessible label |
|---|---|---|---|
| `nav.home` | `house` | Light; active Solid | Home tab — `Home` |
| `nav.action` | `square-plus` | Light; active Solid | Drink It! `Log a Drink`; Ship It! `Challenges` |
| `nav.gallery` | `images` | Light; active Solid | Gallery tab — `Gallery`; unread dot is **separate UI**, not part of icon |
| `nav.achievements` | `star` | Light; active Solid | Achievements tab — `Achievements`; independent unread dot |
| `nav.wrapped` | `award` | Light; active Solid | Awards navigation — `Wrapped` |
| `header.switch-game` | `arrows-rotate` | Light/Regular | `Switch to {otherGameName}` |
| `header.back` | `arrow-left` | Light/Regular | `Go Back` |
| `action.next` | `arrow-right` | Light/Regular | Decorative alongside labeled action |
| `action.close` | `xmark` | Light/Regular | `Close` |
| `action.expand` | `chevron-down` | Light/Regular | Accordions/filter affordance |
| `action.open-row` | `chevron-right` | Light/Regular | Tappable list row affordance |
| `action.search` | `magnifying-glass` | Light/Regular | Drink name search field |
| `action.camera` | `camera` | Light/Regular | Photo add / capture |
| `action.photo` | `image` | Light/Regular | Photo available/placeholder marker |
| `action.download` | `download` | Light/Regular | `Download Photo` |
| `action.retry` | `rotate-right` | Light/Regular | Retry action, alongside text |
| `action.play` | `play` | Solid | Admin resume / optional reveal entrance |
| `action.pause` | `pause` | Solid | Admin pause |
| `action.edit` | `pen` | Light/Regular | Admin menu correction only, not post editing |
| `action.remove` | `trash` | Light/Regular | Admin destructive control (confirmation required) |
| `status.selected` | `badge-check` | Solid (Pro) | Selected bounty rail; use if installed/available; fallback `circle-check` |
| `status.completed` | `circle-check` | Solid | Completed challenge/earned status |
| `status.unselected` | `square` | Light/Regular | Eligible bounty not selected; control includes text |
| `status.locked` | `lock` | Light/Regular | Hidden/secret/unearned achievement |
| `status.unlocked` | `lock-open` | Light/Regular | Only if visually appropriate; earned uses award icon otherwise |
| `status.time` | `clock` | Light/Regular | Timers/ship time |
| `status.info` | `circle-info` | Light/Regular | Supporting explanation |
| `status.warning` | `triangle-exclamation` | Solid | Errors/warnings; never sole communication |
| `theme.drink-it` | `martini-glass` | Light/Regular | Drink It! chooser/identity and generic bar/drink symbol |
| `theme.ship-it` | `ship` | Light/Regular | Ship It! chooser/identity |
| `score.leaderboard` | `trophy` | Light/Regular | Leaderboard, group winning awards |
| `score.achievement` | `award` | Solid | Achievement popup and cards |
| `score.medal` | `medal` | Light/Regular | Wrapped/individual award, where the data calls for it |
| `score.bar` | `location-dot` | Light/Regular | Bar/location metadata |
| `score.friends` | `users` | Light/Regular | Companion/group information |
| `score.team` | `people-group` | Light/Regular | Team context if needed |
| `score.calendar` | `calendar-day` | Light/Regular | Daily schedule, organizer only if helpful |

**Important design distinctions:**

1. **Navigation icons must keep the exact same concept and optical weight** across Drink It! and Ship It!; theming changes color, not the glyph meaning.
2. Active icon can switch from Light/Regular to Solid, but don't introduce a wholly different metaphor or size.
3. **Reaction controls are emoji** ❤️ 😂 🤙, not Font Awesome substitutes.
4. **Achievement-specific icons are content-driven** and supplied later with the achievement catalog. The `award` icon is only the generic shell/celebration icon.
5. The mockup's decorative icons are guides; no requirement to reproduce their exact non-FA glyph shapes. Pick from this registry first, retain visual hierarchy, and use consistent stroke/fill weight.
6. Icon-only buttons must have accessible labels, not merely `title` attributes. Avoid icon-only explanations of status (add text where meaning could otherwise be ambiguous).
7. Use explicit imports/tree shaking rather than loading every Pro style and thousands of icons into the player bundle.

### 13.3 Accessible controls that need explicit descriptions

| Icon-only or ambiguous control | Accessible text |
|---|---|
| Game swap | `Switch to Drink It!` or `Switch to Ship It!` |
| Navigation home | `Home` |
| Navigation plus (Drink It!) | `Log a Drink` |
| Navigation plus (Ship It!) | `Challenges` |
| Navigation Gallery | `Gallery` |
| Navigation Achievements | `Achievements` |
| Navigation Wrapped | `Wrapped` |
| Gallery photo view | `View Full Photo` |
| Gallery photo download | `Download Photo` |
| Gallery close | `Close Photo` |
| Accordion row | `{sectionTitle}, {expandedOrCollapsed}` |
| Reaction with count | `{reactionName}, {count} reactions, {selectedOrNot}` |
| Notification dot (Gallery) | `Gallery, new activity` |
| Notification dot (Achievements) | `Achievements, new achievement` |
| Review selected bounty | `{bountyName}, selected, {points} points` |
| Review available unselected | `{bountyName}, available, not selected` |
| Review already used | `{bountyName}, already claimed today` |

---

## 14. Copy registry implementation instructions for Cursor

- Keep the strings in a small centralized **typed copy catalog** (or equivalent i18n-style registry) keyed by semantic message IDs. Single-language English is sufficient. No internationalization system or CMS is needed.
- Dynamic placeholders must be rendered using escaped normal text binding; do **not** concatenate untrusted user text into raw HTML.
- Pull genuine names, achievement titles, challenge text, points, drinks, bars, team data, and stats from their appropriate **content data** rather than hardcoded strings in this file.
- If a message has singular/plural differences, implement the correct form. No misleading zero counts or copied mockup placeholder names.
- Errors should map from **known outcomes/codes** to these curated messages. Do not show internal database/Edge Function error strings directly to players.
- Use the agreed **warning only if an eligible bounty is intentionally left unselected**. If all currently valid claims are preselected, clicking Submit proceeds without a second confirmation.
- Respect actual game-time state: no hidden-grace UI, no submission action after finale, no Score/Claim button in the wrong context.
- The player-facing rules accordion is **static editorial content** maintained in the app; the actual daily activity names, exact bar assignment, and challenge descriptions remain dynamic.
- When a rule changes by explicit organizer decision, edit the master rules first, then revise the associated player-facing text. This copy file must not become an independent source of new rules.
- No creative rewrites of errors and rules by Cursor. If the approved data supports a surprising edge case with no applicable message, ask for one specific new string; **do not invent a new page or change game behavior**.
- Light, one-time animations may accompany the achievement popup and initial Wrapped reveal. These do not change the copy or create a persistent notification system.
- Final updated mockups may affect a line break, display casing, spacing or label placement; they should **not** silently override established interaction rules or change the semantic copy.

---

## 15. Final organizer copy-review checklist

These are **copy-review items**, not unresolved gameplay requirements. All other text can be accepted as written unless the organizer wishes to refine the tone.

- [ ] **Rules accordions:** Do the quick summaries and expanded plain-language rules sound right, especially the word “must” around companions and required photos?
- [ ] **Review heading:** Approve `Your Bounties` as the replacement for obsolete `Tap to Claim`.
- [ ] **Wrapped headline:** Approve `Ready to see how you did?` and game-specific `See My…Wrapped` button copy, or replace with a preferred final phrase from the new mockup.
- [ ] **Gallery filters:** Confirm the already-established `Everyone / My Gallery` and `Everyone / My Team` labels still match the re-rendered designs.
- [ ] **Small error details:** Read the `Submission Not Confirmed` message in particular; it must stay honest about uncertain saves and reassure the player that Retry is safe.
- [ ] **Font Awesome Pro:** Confirm the organizer has a **Package Token**, not just a web Kit/API key; configure it privately. Cursor may use this icon registry with version-compatible exports, no key pasted into files.
- [ ] **Updated mockup export:** Replace earlier design images in the final handoff when the organizer finishes re-rendering them. This spec deliberately does not presume those new exports are already attached.

**Initial wording accepted for implementation.** Organizer may refine nonfunctional labels in-app after Figma comparison; do not treat this as permission to change gameplay or invent unapproved feature flows.


---

## 16. Final copy approval note

The organizer has reviewed this initial content specification and accepted it for build without line-by-line micromanagement. Error copy prioritizes clarity over jokes. Rules begin straightforwardly, with light personality only where clarity is unaffected; achievement names carry most of the humor. Font Awesome **Pro** may be used with a private package token supplied through local/hosting environment configuration, **never committed, pasted into this project, or included in the ZIP**. Use the symbol names and assigned styles from the registry where they match the visual reference.

**Visual-asset caveat:** This package includes the most recent mockups actually uploaded to this conversation (15 original exports plus 3 later change screenshots and 1 separately supplied Ship It! challenge-list reference). An additional promised re-rendered full ZIP has not been supplied at package-generation time; if it arrives, replace the exports and recheck any affected text or icons.
