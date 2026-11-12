# Development Director Handoff — PC1 Pre-Cruise Experience + Final Rules Corrections

**Project:** Star Princess Cruise App (Drink It! / Ship It!)  
**Prepared:** November 11, 2026  
**Owner authorization:** Implement the PC1 pre-cruise experience using the approved layout and copy **and** reconcile the gameplay-rule corrections below.  
**Handoff status:** Ready for Development Director review, scoping, and subsequent Cursor direction.  
**Important:** This file is **standalone**. The complete player-facing text is attached in Appendix A below; no Google Doc or separate file is needed to know what to display.

## 0. Message to the Development Director

The organizer has reviewed and rewritten the pre-cruise rules for both games. **The rewritten wording reflects intentional, authoritative gameplay decisions**—including changes that were not yet conveyed to engineering. Do not treat discrepancies as player-copy mistakes or quietly change the new text to match old code.

Your assignment is to:

1. Rebuild the authenticated `pre_cruise` player experience in the **existing visual design system** and based on the approved rough layout below.
2. Implement the two game-specific rules pages using **Appendix A's final player-facing copy**.
3. Audit and implement the **behavioral rule changes** called out in Section 2, ensuring scoring, claim eligibility, rankings, and Wrapped are not inconsistent with what players are told.
4. Coordinate bounded work for Cursor, review test evidence/screenshots, and obtain organizer sign-off. **Do not use this as authorization to redesign active-game UI or touch unrelated game systems.**

Existing handoffs and implemented rules are useful technical references. **On the specific conflicts identified here, this newer owner-approved handoff takes precedence.** Do not send Cursor a broad "fix anything" mandate. First inspect actual code, then issue scoped work.

## 1. Approved PC1 UX and copy layout

### A. Authentication and routing

- The pre-cruise experience is **available only after login**. Keep the existing auth/account/logout experience.
- For `pre_cruise`, route logged-in normal guests to a **single shared landing page**, not empty game Home screens.
- Hide/unreach ordinary active-game pages in this lifecycle: bounty carousel, logging, live challenges/submissions, empty leaderboards, Gallery, achievements, and normal gameplay bottom navigation. Direct URL, refresh, and existing session must not bypass the app-level guard.
- Authorized admins retain authorized access to existing admin functionality; never show admin controls to ordinary players. Do not change guest permissions or allow nonparticipants to claim in a game they don't play.
- Rules for **both** games can be read from the pre-cruise landing page; reading rules is not the same as being eligible to play either game. The organizer's concept shows both sections.
- Preserve real network/auth/error states rather than mislabeling them as normal pre-cruise states. In particular, no intentional "Couldn't Load Game Data" on the landing page.

### B. Landing page — organizer's approved rough concept

Use the **existing `/` game selection content and visual assets** as the foundation. This is a rearrangement, **not** a new marketing-style welcome page. The organizer provided a rough 402px-wide screenshot with three vertical regions:

1. **Top Drink It! region:** established mint/aqua visual theme, existing cocktail icon, "DRINK IT!" wordmark, a large established button relabeled **"Read the Rules"**.
2. **Middle countdown strip:** centered **"Game Begins:"** and prominent days / hours / minutes / seconds, on a warm/cream neutral background. This sits **between** the two game regions. It is the only countdown on the landing concept.
3. **Bottom Ship It! region:** established warm/tan treatment, existing ship icon, "SHIP IT!" wordmark, large established button relabeled **"Read the Rules"**. Reuse the current Ship It! button/theme as appropriate.

Preserve the current iconography, proportions, typography language, left-to-right theme gradients, and mobile sensibility. No new illustrative hero, extra account pitch, or extensive intro copy. This is **rough composition direction, not pixel-perfect measurements**; keep the approved elements and make them responsive.

### C. Two rules pages — same reusable structure

Each of **Drink It!** and **Ship It!** gets a dedicated pre-cruise rules route. Reuse the already-established How to Play / Home accordion styles and appropriate warm/tan **left-to-right gradient**. Above the content:

- **Back-to-home** control at top left (returns to the countdown landing page).
- **Countdown at the top** (displaying time remaining to appropriate game opening; see timing section).
- Game-specific title and a concise intro exactly as in Appendix A.
- **One dropdown/category selector** with these exact four choices, in order: **Quick Rules, Full Rules, Strategy Guide, FAQ**.
- Below the selector, show **only the chosen section**, with the corresponding `###` headings from Appendix A as familiar expandable **Home-style accordions**. Preserve the writing; do not render four long sections simultaneously. The four selectors are not four extra accordions.

This is primarily **copy approval and established component reuse**, not a fresh design exercise. Do not build educational animations or additional pages.

### D. Countdown, ship time, and lifecycle

- Use the existing **authoritative server/Ship Clock and lifecycle configuration**. Never hardcode a cruise start date or trust just the user's phone clock.
- Confirm whether **Ship It! and Drink It! open at the same instant**. The owner's screenshot favors a single shared landing countdown. If the configured starts differ, do **not** display an inaccurate common countdown; resolve the actual configured opening contract with the director before selecting a small, readable way to distinguish them. On each rules page, show the countdown relevant to that game.
- Render days, hours, minutes, seconds; update smoothly while open. On reaching zero, **recheck server lifecycle** and transition only if genuinely active and the user eligible. Otherwise show a friendly "Opening Soon" state and continue checking.
- Do not show a general current ship clock to players. The countdown is the only time display called for here.
- Do not alter underlying Ship Clock math, active/finale transitions, or game-start configuration merely to make the UI demo work. Use isolated fixtures for very-near-zero/expired visual tests.

### E. Mobile and visuals

- Primary review at **402 × 874 CSS px**, with checks at **360, 390, and 430px**.
- No horizontal overflow, nested scroll traps, hidden content under safe areas, or unintentional gameplay bottom nav.
- Take screenshots of landing, both rules pages, selector states, near-zero countdown, and "Opening Soon" if relevant.
- **Stop for organizer visual/copy approval** after implementation. No unrequested polish pass across active-game screens.

## 2. AUTHORITATIVE GAMEPLAY RULE CHANGES — do not treat as copy-only

These came directly from the organizer's final edited copy and explicit confirmation. They supersede conflicting older developer handoffs/current code. Investigate implementation before assigning Cursor work.

### 2.1 Ship It! — final team ranking: **first to reach a tied score wins the tie**

**New rule:** The higher **final team point total** wins. If teams finish with **equal final point totals**, the team that **first reached that final total through an accepted challenge completion** finishes ahead. In particular, the **first team to complete all 50 challenges wins**, so a team that finishes in three days cannot be tied for first with a team that finishes the same 50 over seven days.

- This is a real **ranking/tiebreak change**, not new bonus points and not changing how individual challenge scores are awarded.
- Apply the same result consistently wherever **Ship It! team placement** is shown: leaderboard order/rank, final awards/results, and Ship It! Wrapped team placement/winner. Existing `1, 1, 3` shared-place logic may still be correct for other competitions; **do not globally replace unrelated tie rules**.
- Use **authoritative server-accepted event order/time**, never photo EXIF, user device timestamps, or claimed photo creation time. Base it on valid accepted, not-voided completions; consider any existing correction/void pipeline and idempotent receipts.
- The technical treatment of a true same-instant collision should be deterministic using trustworthy server event ordering/IDs rather than random order. Surface any data-contract limitation to the director instead of inventing a new client timestamp authority.
- **First to Find achievement competition remains separate**; all teams can still complete regular challenges for points. Don't confuse exclusive achievement winners with team-score tie-breaking.
- Add tests: unequal scores; equal scores reached at different times; first team to all 50 vs later team to all 50; different completion order with same final total; void/recalculation; persistence in Wrapped and final leaderboard; replay does not alter finish time.

### 2.2 Ship It! — submitting player appears in the proof photo

**New rule:** Every challenge needs a photo, and **the submitting player must be in that photo**. Ideally more of the team is included. A particular challenge may require multiple people or the whole team, and those instructions still apply.

- Preserve **honor-system evidence**. The app is **not** expected to automatically analyze images, recognize faces, identify the player, or have a moderator approve each submission.
- Show the requirement prominently in rules and, if needed, as concise instructional text in the existing submission flow without extra steps.
- Preserve team-wide completion and one accepted score per team/challenge. Teammates do **not** all have to appear unless the specific challenge requires it.
- Test that photo-required submission and existing upload/recovery still work; do not attempt to programmatically prove whose face is in the image.

### 2.3 Drink It! — **buddy/witness rule for all four scored bounty categories**

**New rule, explicitly confirmed by organizer/Dad:** **No player can score any bounty alone.** To qualify for a **Cocktail Bounty, Ingredient Bounty, Bar Bounty, or Daily Challenge**, the claiming player must be physically accompanied by **at least one other active Drink It! participant** at the relevant activity/drink. That person is the informal social witness that keeps the honor system honest.

- For **Cocktail and Ingredient**: any one other active Drink It! player is sufficient. They do not need to order the same drink, submit their own log, or approve the claimant's submission remotely.
- For **Bar Bounty**: at least one **assigned daily crewmate** must be present, and **only assigned crew members** contribute to the established 20/30/40 award. Other friends may be logged normally but do not satisfy the assigned-crew requirement.
- For **Daily Challenge**: the activity must include other Drink It! participation as specified by All Hands / Bring a Friend below. Honor-based participation/claim is intended.
- Preserve **one existing companion selector** for drink logging and its existing simple honor system. **No second crew picker, no push confirmation, no reciprocal second log requirement, no selfie verification, no biometric/photo analysis, no separate approval process.**
- Where the current drink submission already captures a selected companion, validate eligibility against actual Drink It! membership in the existing authoritative backend claim path. A client-only button disable is not sufficient. If the current Daily Challenge yes/no/photo flow has no companion field, do **not** invent a second picker as a unilateral workaround: document the least-friction acknowledgment/claim contract and let the director reconcile that specific architectural gap.
- **Ordinary, non-scoring drink logs are still allowed solo** and remain useful for achievements/Gallery/Wrapped. Do not erroneously block all logging without a buddy.
- **One drink can still qualify for multiple bounty categories** if all requirements and current windows are met; each category remains one claim/day.
- Add tests for solo claims blocked (or honor-assertion absent), active companion accepted, non–Drink It! companion not sufficient, crew/noncrew distinctions, multiple-category overlap, companion not independently logged, and ordinary solo logs still accepted.

### 2.4 Drink It! — All Hands scheduled **attendance is now required**

**New rule:** All Hands Daily Challenges are actual scheduled meetups. **To earn that day's 50 points, the claimant must personally attend and participate at the announced meeting time.** Simply doing the same activity later does not qualify. This supersedes the old treatment of All Hands meeting announcements as purely informational.

- The meeting time is set by admin and shown on the challenge card. **Do not invent or hardcode any meetup time.** Preserve current admin-configured announcement handling.
- **Do not require 100% of the active roster to show up** in order for an individual attendee to earn points. "All Hands" means the invitation/meeting, not an all-or-nothing turnout dependency.
- The claim/upload may take place **after** the meetup. **Do not use the phone upload/claim timestamp to reject an attendee** who was actually present at the meeting. Treat participation as an honor-based requirement consistent with the simple Daily Challenge flow.
- **Bring a Friend** days require completion with **one other active Drink It! player**, not necessarily a Bar Bounty crewmate. Keep the seven final daily activities/days/locations and 50-point values unchanged.
- Ensure new rules appear in actual active-game card instructions, not just PC1 copy, when gameplay opens. Be conservative with changing the Daily Challenge data/schema or submission RPC; identify any required contract addition before Cursor work.
- Test announced vs unset meeting-time display, honor-based later photo upload, missing attendee vs normal self-attestation UX, and normal Friday cutoff.

### 2.5 Drink It! — Ingredient rotation is **every two hours**

The authoritative player copy says **Cocktail Bounties rotate hourly** and **Ingredient Bounties rotate every two hours**. Reconcile current scheduler, displayed timer/countdown, data fixtures, tests, and any older handoff references that incorrectly say Ingredient also rotates hourly.

- Do not change Cocktail rotation to two hours.
- Keep eligibility windows, claim cutoffs, and ship-time authority aligned to the actual rotation. No inventing extra daily objectives.
- If already implemented correctly, document evidence and leave code alone. This is both copy and rules confirmation.

## 3. What must stay unchanged

- The four scored Drink It! categories and their existing base point logic: Cocktail 25–100, Ingredient 25–100, Bar assigned-crew 20/30/40, Daily Challenge 50.
- One per category per day; categories may overlap on a single eligible log. No first-to-claim rule on Drink It! bounties.
- Normal Drink It! game hours 12 PM–11 PM ship time, with final Friday 6 PM cutoff. Ship It! shared Friday 6 PM cutoff.
- Current seven Daily Challenges, per-day location/mode assignments, team membership/roster, achievement catalog/award rules, fixed challenge catalog, game point values, database policies, and unrelated active-game UX.
- The entire approved crew assignment scheme and score-locking rules: day-specific randomized groups of 3/4 with repeat avoidance, one individually claimed Bar Bounty per day, capped at 40, no upgrade after claim.
- Existing private Gallery/photos and achievement announcement/reaction flows; achievements **do not** award competition points.
- Server-authoritative ship clock, pause/finale protections, submission/idempotency, RLS, team-scoped claims, and other security/consistency invariants.
- No reset, no scenario switch, no premature opening/finale or Wrapped QA as part of PC1.

## 4. Implementation approach for the Director

1. **Inspect, compare, and write a focused impact summary.** Current `pre_cruise` guard and `/` selection screen; approved How to Play components; server game-start contract; actual Cocktail/Ingredient schedule; Drink It! claim RPC and companion capture; Daily Challenge submission; Ship It! ranking and Wrapped. Clearly mark what's already implemented versus missing.
2. **Break work into bounded Cursor phases**, avoiding simultaneous broad backend + UX churn. A sensible split is: (A) ranking/buddy/All Hands/schedule behavior with tests as actually needed; (B) pre-cruise route/countdown/rules pages and exact copy; (C) integration smoke/screenshots and visual sign-off. Director may reorder for dependencies.
3. **Treat Appendix A as product copy, not as optional developer prose.** Preserve jokes, headings, order, and meaningful emphasis. Minor typography/line-wrap editing is fine; do not silently rewrite the rules to fit old mechanics.
4. **Review evidence for each new rule** before declaring complete. Server-side behavior where the claim schema supports it; explicit honor-system treatment where it doesn't; server-authoritative tie rank everywhere it is surfaced; ingredient timer consistency; regression checks in active-game flows.
5. **Show organizer the screenshots** for the landing, Ship It! rules page and Drink It! rules page, plus important accordion states. Obtain visual/copy approval. Do not continue into an unrelated design or backend cleanup phase.

### Minimum test / review checklist

- [ ] Pre-cruise login and session redirect; blocked active gameplay route via URL/refresh; admin remains accessible; logout works.
- [ ] Both rules pages can be reached and return to countdown; four-selector dropdown correctly filters accordion groups; correct approved copy.
- [ ] Countdown derives from authoritative config and server offset; zero does not unlock on its own; game-specific openings not misrepresented; no general ship-time display.
- [ ] Drink It! social companion requirement handled consistently in claims without reciprocal confirmations, duplicate pickers, or blocking solo ordinary logs.
- [ ] All Hands requires scheduled attendance by rule but doesn't incorrectly enforce claim-submission timestamp as attendance time; Bring a Friend is any eligible Drink It! player.
- [ ] Ingredient rotation every two hours, Cocktail hourly, displayed timers and backend in agreement.
- [ ] Ship It! requires a submitted photo; player-facing text establishes submitter-in-photo honor rule; no invented face analysis/approval system.
- [ ] Ship It! tied-score ranking is time-ordered, including first to finish all 50; consistent in live standings, final results, and Wrapped; untouched tie rules for other competitions.
- [ ] Relevant frontend/unit/integration checks green; existing gameplay remains intact; screenshots at 402×874, 360, 390, 430.
- [ ] STOP for organizer approval. No Wrapped QA, scenario switching, or unrelated refactoring.

---

# Appendix A — Exact player-facing copy for both pre-cruise rules pages

**Implementation notes:** Each `# GAME` is a separate page. Its first italic paragraph(s) are the intro. `## 1–4` are the **four dropdown options**. Each `###` is an **accordion title** inside the chosen option. Strip this implementation note from the player-facing UI. The copy below intentionally makes every previously buried rule prominent.

# SHIP IT!

*The ultimate cruise scavenger hunt. Gather up your team, find all the challenges, and get ready to have bragging rights for eternity!*

## 1. QUICK RULES

### The Basics

Ship It! is a team scavenger hunt with 50 challenges scattered across the cruise adventure. Some will be easy, some will take a little creativity, and some will have you mad David even put it on there.

Your mission? Complete challenges, take pictures, and earn points for your team!

### How to Play

1. Open the Challenges page and pick something to complete.
2. Follow the instructions for that challenge.
3. Take a photo showing you completed it. **You must be in the photo!** Ideally, get your whole team in there too. Some challenges specifically require more teammates.
4. Upload your photo and submit!

That's it! Once a challenge is completed, it's finished for your entire team.

### How to Win

Challenges are worth 100–500 points, depending on their difficulty.

Every completed challenge adds points to your team's score. **The team with the most points wins!** If two teams finish with the same score, **the team that reached that score first wins the tie**. And if a team finishes all 50 challenges, the **first team to finish all 50 wins**.

### When Can We Play?

Ship It! runs throughout the cruise. Complete challenges whenever you get the opportunity.

**The game ends Friday at 6:00 PM Ship Time.**


---


## 2. FULL RULES

### Your Team

You've been assigned to a team for the cruise. You'll work together to find and complete challenges, with every member contributing to the same team score.

You don't have to complete every challenge together. Split up, explore, and work as a team however you like.

### Challenges & Categories

There are 50 challenges divided into five categories.

Each challenge has its own instructions and point value, ranging from 100 to 500 points.

Some tasks are straightforward. Others will require exploring, teamwork, or a little creativity. Read each challenge carefully before submitting. The app does not decide whether your photo really “counts.” That part is on the honor system. That, and public roasting if you complete a challenge with the wrong thing. 

### Completing a Challenge

When you've completed a challenge, select it from the Challenges page, upload the required photo, and submit it. Every challenge requires a photo. Make sure yours clearly shows that you've met the challenge requirements.

**The person submitting the challenge must appear in the photo.** Ideally, bring your whole team into the shot. Some challenges specifically require multiple teammates or the entire team, so follow their instructions.

### Team-Wide Completion

When one team member successfully completes a challenge, it counts as completed for the entire team. You don't need everyone to upload the same photo or complete the same task. Each team can earn points for a particular challenge only once.

### Leaderboards & Scoring

Your team's points come from completed challenges.

The leaderboard shows how the teams stack up throughout the cruise. Every team can complete the regular challenges independently, so one team's completion doesn't stop anyone else from earning those points.

**If two teams finish tied in points, whoever reached that final score first ranks higher.** The first team to complete all 50 challenges wins. So yes, speed can matter!

### Achievements

Along the way, you may unlock achievements for completing certain tasks, reaching milestones, or discovering something before anyone else. Achievements are just for fun and bragging rights. They do not add points to your team's score. The titles are all jokes or references, so make sure you check them often to see if you understand the reference!

### The Gallery

Submitted photos appear in the Ship It! Gallery, where everyone can enjoy the evidence of your team's questionable decisions. Browse photos, revisit favorite moments, and react to other submissions.

You can also click on any image you’d like to make it full screen and download it. 

### The Grand Finale

Ship It! ends Friday at 6:00 PM Ship Time.

After the game closes, you'll be able to explore the final results, achievements, and your “Cruise Wrapped,” which is a look back at everything your team accomplished.


---


## 3. STRATEGY GUIDE

### Divide and Conquer

You don't need your entire team together for every challenge! If you're headed to the pool while your teammates are exploring the ship, keep an eye out for different opportunities. Covering more ground means more chances to find something worth completing.

### Start with the Easy Wins

Don't overlook those 100-point challenges. Completing several easy challenges can add up quickly, and it's a great way to get your team on the scoreboard early. You might also catch a fun achievement if you do a challenge first!

### Keep Your Eyes Open

Some challenges may be easier to complete when you happen to be in the right place at the right time. Take a look through the challenge list before exploring the ship. You never know what you might stumble across.

### Communicate!

Make sure you pay attention to which challenges are completed already, no point in searching for a challenge only to find out someone on your team already got it the day before.

### Don't Forget the Photo

The perfect opportunity isn't worth much if nobody remembers to take a picture. Before moving on, make sure you've captured whatever evidence the challenge requires. You can take the photo right in the app, no need to do it separately. 


---


## 4. FAQ

### Does everyone on my team have to participate in every challenge?

Nope! One team member can complete and submit a challenge for the entire team, unless that challenge specifically requires multiple people.

### If I complete a challenge, does my whole team get the points?

Yep! Every accepted challenge counts to your team's shared score.

### Can another team complete a challenge we've already finished?

Yep. While some achievements can only be earned by the first to find the challenge, every team can log any challenge for points.

### Can our team complete the same challenge twice for extra points?

Gambling already? No lol. You cannot. 

### Do we have to take pictures?

Yep! Every challenge needs a photo, **and the person submitting it needs to be in the picture**. Follow any extra teammate requirements on the challenge itself. No cheating!

### What if someone else on my team already submitted it?

It's done! If anyone on the team gets it, then it's done for the whole team. 

### Do achievements give us extra points?

Nah they are just fun extras that pop up as you complete challenges. The titles are meant to be jokes or references, and they show up in the gallery to be laughed at collectively. 

### What if two teams finish with the same score?

The team that reached its final tied score first gets the higher ranking. And the first team to finish all 50 challenges wins. No waiting until Friday for another team to catch up! 

### What happens after Friday at 6 PM?

Scoring closes, the final results are revealed, and you can explore your Cruise Wrapped and look back through the Gallery to save all those precious memories!

### What's the most important rule?

Have fun! (and the best way to have the MOST fun is to win)


# DRINK IT!

*Seven days. Thirteen bars. An ocean of cocktail choices. May the bravest player win.*

This game will encourage you to explore the ship, visit the bars, discover new drinks, hang out with everyone and earn points while doing it!

## 1. QUICK RULES

### The Basics

Drink It! is an individual, weeklong game built around exploring the ship's bars, trying different drinks, and being social about it.

Every day, you'll have **four different ways to earn points**. You can claim each one once per day, and sometimes one drink qualifies for more than one category!

### The Four Bounties

- **Cocktail Bounty:** Find the featured cocktail at its designated bar.
- **Ingredient Bounty:** Find a drink containing the featured ingredient.
- **Bar Bounty:** Visit the day's featured bar with members of your assigned crew.
- **Daily Challenge:** Complete a special activity for the day.

You can claim each category once per day. You don't have to complete all four!

**Important: You need at least one other Drink It! player with you to claim any bounty.** That includes Cocktail, Ingredient, Bar, and Daily Challenge points. It's a social game, after all!

### How to Earn Points

When you find something that matches a bounty, **have another Drink It! player with you**, log your drink or complete the activity, and claim the available points. That other player helps keep things honest; they don't need to approve anything in their own app.

You can also log other drinks just for fun (it's easy to do, and it lets you unlock achievements!). Keep an eye on the leaderboard to see how you compare to everyone else!

### When Can I Play?

Drink It! runs from **12:00 PM to 11:00 PM Ship Time** each day.

The final day, Friday, ends early at **6:00 PM**.


---


## 2. FULL RULES

### The Buddy Rule — Every Bounty

**You need at least one other active Drink It! player physically with you when you complete a bounty.** They're your witness that you actually did it, not a remote approval button. No solo Cocktail Bounties, Ingredient Bounties, Bar Bounties, or Daily Challenges for points.

When logging a drink, select the players who were with you. You're all on the honor system: the other person doesn't have to log the same drink or confirm your claim in their account.

You can still log ordinary drinks on your own, but those logs won't earn bounty points by themselves. For a **Bar Bounty**, your companion must specifically be from your assigned crew. For **All Hands** or **Bring a Friend** Daily Challenges, follow the additional attendance rules below.

### Cocktail Bounties

Every hour, a cocktail bounty appears. It will tell you the name of the drink, what's in it, and what bar it can be ordered from. To claim the bounty, go to that bar and order it **with at least one other Drink It! player present**. Just make sure you log and claim it before the timer resets.

Cocktail Bounties are worth **25–100 points**, and it's based on how unusual or adventurous the drink is.

There are four difficulty levels: Boring, Interesting, Exciting, and Adventurous. The “weirder” the drink, the more points you get. It changes hourly, so keep an eye out for something that catches your interest!

You can claim one Cocktail Bounty per day, choose wisely!

### Ingredient Bounties

Every two hours, a featured ingredient appears. Unlike the Cocktail Bounty, you are not given a location, only how many bars have it on the menu. Your job is to track down a bar and drink that have it, **with at least one other Drink It! player along for the claim**. That means you'll have to do a little recon of your own, so pay attention to the featured cocktails, you may remember something you saw!

Ingredient Bounties are worth **25–100 points**, depending on how rare the ingredient is across the ship's bars. Lower point ingredients are easier to find, the 100 point tier will require some investigative work. 

You can claim one Ingredient Bounty per day.

### Bar Bounties

Every day, one bar will be selected as the featured Bar Bounty location.

You'll also be assigned a small crew of three or four Drink It! players. Your crew changes daily, giving you a chance to spend time with different people throughout the cruise. Crews are randomly assigned, not preselected by Dad or Josh. 

Visit the featured bar with at least one of your assigned crewmates, log your drink, and select the crew who joined you.

**Here's how the points work:**

- You + one assigned crewmate = **20 points**
- Three members present in a four-person crew = **30 points**
- Your entire assigned crew present = **40 points**

If you're in a three-person crew, all three together also earn 40 points.

Other friends are always welcome, but only your assigned crew members count toward Bar Bounty points. Everyone still logs and claims their own drinks.

You can claim once per day, and your points are locked in when you claim. So if someone wasn’t available earlier but is now, tough luck!

### Daily Challenges

Every day features a special activity worth **50 points**. 

**All Hands:** These are scheduled group meetups. **To earn the 50 points, you personally must attend and participate at the announced time.** Showing up later to do the same activity does not count. Everyone is invited, but your points depend on *your* attendance, not on whether every other player shows up.

**Bring a Friend:** Complete the challenge with at least one other Drink It! player. It does **not** have to be someone from your assigned Bar Bounty crew. 

Complete the activity, upload your photo, and claim your points.

All Hands challenges will announce the meeting time on their cards. If you can’t make the scheduled meetup, better get those points elsewhere that day! **You can upload your photo afterward, but you must actually have attended the scheduled meetup.**

You can claim one Daily Challenge each day.

### Logging Your Drinks

You can (and should!) log drinks even when they don't match a bounty. Logging drinks unlocks achievements you might not normally get, contributes towards your final stats, and puts the photo in the gallery for others to enjoy!

You won’t earn extra points for doing this, but maybe you'll have more fun trying to complete the 120+ achievements vs logging bounties anyway.

### Can Bounties Overlap?

Yes! Sometimes the stars align and you can earn more than one bounty category per drink. 

For example, if the featured Cocktail Bounty happens to contain the featured Ingredient Bounty ingredient, you may be able to claim both with the same drink.

Each category still has its own “one claim per day” limit though. 

### Achievements

Achievements are fun extra rewards that you get doing all sorts of things, going to bars, drinking drinks, being social, etc. Some are super easy, some are challenging, and a few are secret. You just gotta log drinks and hope you hit it!

They unlock automatically when you meet their requirements. There's nothing extra to submit.

They don't add to your leaderboard points, but they are fun! They have a fun title and you can compare which ones you've gotten! Keep your eyes peeled for LOTS of Jimmy Buffett References!

### The Gallery

The gallery is a simple instagram style place to show all the photos and achievements from the week. You can look at what other people are drinking, react to images, and even download them yourself if you want to save a fun memory. 

Add captions, tell stories, find new drinks, the gallery is the place to see all of it!

Plus, achievements show there, so you can see what everyone else has unlocked!

### The Grand Finale

Drink It! officially ends Friday at 6:00 PM Ship Time.

After the game closes, check out the final leaderboard, your achievements, and your Cruise Wrapped to see how your week turned out.


---


## 3. STRATEGY GUIDE

### Choose Bounties Carefully

Suppose a 75-point cocktail appears that sounds pretty good. You could order it and collect your points.

Or you could wait until the next hour, hoping a 100-point cocktail appears.

But the next one might be worth only 25 points. Or it might be something you don't like, at a bar you can't reach, or appear while you're busy with dinner.

Since you can only claim one Cocktail Bounty per day, deciding when to take the points is part of the game.

### Get to Know Your Crew

Your assigned Bar Bounty crew changes daily.

It will take a bit of planning, but just hanging out with people gets you the max points in this category! So you might as well try to meet up with your crew every single day, there's no reason not to!

And remember: once you claim, those points are final!

### Explore the Menus

Ingredient Bounties are all about discovery.

Browse the menus, look for unfamiliar ingredients, and pay attention to what different bars specialize in.

You might discover a new favorite along the way!

### Don't Ignore Achievements

The leaderboard isn't the only thing worth chasing.

You can unlock achievements for all kinds of activities, including trying new drinks, visiting different bars, and socializing with other players. Some even have collection checklists to help you track your progress.

You might be surprised what an ordinary drink log unlocks!

### Make It a Social Game

The game is designed to give everyone an excuse to explore, try something different, and hang out together. Don't be afraid to invite someone you haven't spent much time with yet. The points are fun, but the stories are better.


---


## 4. FAQ

### Do I have to drink every featured cocktail?

Absolutely not! All bounties are optional. Pick the ones you actually want to try.

### How many bounties can I claim each day?

Up to four: one Cocktail Bounty, one Ingredient Bounty, one Bar Bounty, and one Daily Challenge.

### Can I claim two bounties with one drink?

Yes, as long as your drink meets both sets of requirements, **you have another Drink It! player with you**, and you haven't already claimed either category that day.

### Can someone beat me to a bounty?

Nope! Everyone can earn every bounty that appears. It's not a first-to-claim situation, as long as you log it within its window, you'll get the points. 

### Do I have to drink with my assigned crew?

You need **at least one other active Drink It! player physically with you for every scored bounty**. For Cocktail and Ingredient Bounties, any other Drink It! player counts. For Bar Bounties, at least one companion must be **on your assigned crew**. Daily Challenges have their own All Hands / Bring a Friend attendance rules. The other player does not need to approve your claim on their phone. 

### What if I visit the Bar Bounty bar alone?

You can still log your drink, but you won't earn Bar Bounty points without at least one assigned crewmate physically present.

### Can I earn more Bar Bounty points if I return later with more people?

Nope! Plan accordingly, once you log your points, that’s a wrap for any bounty. 

### Does my buddy have to confirm my bounty on their phone?

Nope. Just record who was with you in the normal logging flow. We're trusting each other to play fair.

### Do all my crewmates have to log the same drink?

No. Everyone logs their own drinks and makes their own claims. Your points are based on the assigned crewmates you report being with.

### If I miss an All Hands meetup, can I do it later?

Not for points. You need to **attend the announced meetup at its scheduled time** to claim that day's All Hands challenge. You can submit the photo afterward, but you can't make up the meetup later.

### Can I log drinks that aren't part of a bounty?

Yes! Please do, it counts towards your stats and achievements. The more you log, the more fun achievements you get and the more your Cruise Wrapped has to say about you!

### Do achievements count toward the leaderboard?

No. Achievements are a separate collection of fun accomplishments and don't award competition points.

### Do I need a photo for every drink?

Nope. Photos are optional for ordinary drink logs, but Daily Challenges require one.

### What happens when the game ends?

At 6:00 PM on Friday, new scoring ends. You'll be able to see the final results, explore your achievements, and enjoy your Cruise Wrapped.

### What if I just want to enjoy my vacation?

Then you're playing correctly.

Drink It! is meant to add a little fun to the cruise, not turn your vacation into a checklist. Participate as much or as little as you'd like!
