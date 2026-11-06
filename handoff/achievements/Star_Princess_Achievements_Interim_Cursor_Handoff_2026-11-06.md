# Star Princess — Achievements: Interim Cursor Logic Handoff

> **STATUS: PROVISIONAL SNAPSHOT — NOT THE FINAL ACHIEVEMENT CATALOG.**
>
> Captured **2026-11-06** from the existing Google Doc, **Cruise Drinking Game**:
> https://docs.google.com/document/d/1_MSZUQQde8h2K1On6sSuP3dion3XHz9bHMRVVwNoFY4/edit
>
> Google Docs revision observed when reading the source: `AHj4eMT6sO_KE_ydPsErFmpnUv0ryOeQhR3QJk4gyqZHO7K6sYw6748ytoER_01NrB9nZaNgVYzQlV_lsQdEOLukVo64m5d7wpB8Jxwacw`.
> **The Google Doc remains the editable source of truth. This Markdown is a handoff snapshot.**

## Purpose and scope

- Give Cursor the **current names and exact trigger text** for **48 Ship It!** and **92 Drink It!** working achievements, so it can design/build the evaluator, data model and tests now.
- **Do not treat this as an approval to freeze titles, thresholds, visibility, IDs, or the full catalog.** A new snapshot will be supplied later after more edits. Build the achievement system to accept additions, edits, disables, and reconciliation without destructive resets.
- The achievement tables below reproduce the current Google Doc **in existing row order**. Spelling, punctuation, capitalization, and odd wording are intentionally preserved. The leftmost `S-` / `D-` references are **temporary snapshot row pointers, not database IDs**. Do not use display names as identifiers.
- The current Google Doc has one entirely blank Drink It! table row (**document row 27 after the header**); this is **not** an achievement and is omitted below without moving other snapshot row references.
- The Google Doc’s Game Rules tab was **not** recopied here. For game rules and live backend schemas, consult Cursor’s existing approved app specifications and code; do not infer that every historical rules paragraph is the latest decision.
- Achievements are for collection, celebration and discovery; they do **not** add to the Drink It!/Ship It! gameplay point leaderboards.

## Implementation guidance — separate from the exact source catalog

These are **engineering considerations** based on the project discussion, not extra approved achievements or silent edits to the rows below.

1. **Separate stable identity from display name and trigger definition.** Names are still being edited and some names repeat. Prefer stable internal keys and versionable conditions; preserve user-awarded history when definitions change. Any final ID/group/visibility/difficulty assignment remains for the later review.
2. **Use recorded, accepted game events as evidence.** Ship It! conditions should use valid team scavenger completions, canonical challenge/category identifiers, and accepted submission timestamps. Drink It! conditions should use recorded beverage logs, canonical drink and bar identity, captured companions, and credited bounty claims, according to the existing app model. Handle duplicate submissions/retries idempotently, and avoid inventing extra user logging steps.
3. **Treat Ship Time as the authority for windows and days.** The project uses a server-managed Ship Clock with admin-set offset; do not use device-local time. Port days/port hours, the first and final cruise days, the Thanksgiving holiday, and the game-end cutoff need explicit authoritative configuration. Time checks use the appropriate event timestamp; confirm edge inclusivity with current backend conventions.
4. **Ship It! awards are team awards.** Task-specific and collection achievements are repeatably earnable by different teams. The nine conditions explicitly saying “before any other team” are exclusive Firsts; assign to the earliest eligible accepted team completion, with atomic/consistent tie handling. Award notification to the initiating submitter while storing the team-wide unlock, consistent with the app UX plan.
5. **Drink It! achievements are normally personal.** Companion requirements check the logger’s selected enrolled companions. The eight player-specific inside jokes in the final rows refer to named companions, including **David B** and **David F** as distinct people. The user has floated also awarding the named companion automatically, but that behavior is **not decided**; flag it for product confirmation, and do not implement dual awards as an assumed requirement.
6. **Ingredient and composition conditions need structured source data.** Match normalized ingredient/scoring keys, spirit families, rum styles, frozen classification and exact recipe ingredient counts—not parenthetical display aliases or naive substring matches. The menu snapshot may change; rely on editable catalog metadata and clear recipe definitions. Beer, Wine and “Other alcoholic drink” are already distinct log options; the “Other” achievement is **not** a new custom-order workflow.
7. **Cumulative and same-drink conditions differ.** Count distinct canonical cocktails vs total logs as specified, track repeated drinks across bars/days where specified, accumulate distinct companions or ingredient families over the week, and match multiple bounties credited to the **same drink event** where called for. Don’t infer a single log must be a scoring bounty log unless the trigger says so.
8. **Overlap is allowed.** One event can unlock multiple achievements. Avoid duplicate grants, and present simultaneous unlocks as a coherent batch. Preserve deliberately duplicated triggers/names for review; do not automatically merge or silently delete rows.
9. **Before implementing hard-to-evaluate conditions, report feasibility.** “Take it to the limit” needs an unambiguous daily attainable-maximum formula and may be schedule/group dependent; “Screamin' Boat Drinks” needs a precise eligible combined pool-menu set; “Wrinkles only go where the smiles have been” needs a stable definition of participating Drink It! players; and some named-companion/recipe classifications may require metadata the current logger does not store. Flag unsupported conditions explicitly rather than faking awards.
10. **Secret/public assignments are not a finalized column in this snapshot.** Use existing achievement UI conventions and defer any unresolved visibility or naming decisions until the later final catalog. Do not manufacture a difficulty tier or enforce an arbitrary achievement count.

## Known catalog collisions and decisions intentionally deferred

- **Duplicate title:** `Wasted away again in Margaritaville` is both **D-001** (first alcoholic drink) and **D-087** (margarita with Josh). These are **different triggers**; do not merge them by name.
- **Duplicate trigger:** **D-035** (`Can’t beat the classics`) and **D-080** (`Not a worry in the world, cold beer in my hand`) both trigger on the Beer option. Preserve both rows pending editorial review.
- **Duplicate trigger:** **D-032** (`Off the Beaten Path`) and **D-084** (`The menu is more of a guideline anyway`) both trigger on `Other alcoholic drink`. Preserve both rows pending editorial review.
- **Player-specific achievements:** **D-086 through D-093** match the named companion in the logger’s selected people. Whether to grant the named companion a second award is unresolved.
- **D-085 daily maximum:** The definition of “maximum attainable” requires a formula and may be unreachable on some randomly generated days; do not silently substitute “four bounties claimed.”
- **D-083 shared pool menu:** Eligibility and availability should be evaluated from the actual current game catalog, with shared menu duplicates counted only once by canonical cocktail identity. Do not treat a historical source list as proof of live stocking.
- **D-081 Thanksgiving:** Verify the cruise day’s actual calendar/Ship Time and whether Thanksgiving is in the game interval. The trigger text in the source is preserved regardless.
- **D-005 30 drinks and other accumulated totals:** These are currently in the editable catalog; building evaluation must not change leaderboard scoring or create repeated notifications as counts increase.

## Ship It! — Current achievements (48)

| Snapshot ref | Name (exact current text) | Trigger (exact current text) |
| :--- | :--- | :--- |
| S-001 | The Start of Something New | Complete your first Ship It! challenge. |
| S-002 | Five Easy Pieces | Complete 5 Ship It! challenges. |
| S-003 | Perfect 10 | Complete 10 Ship It! challenges. |
| S-004 | 15 Minutes of Fame | Complete 15 Ship It! challenges. |
| S-005 | Whoa, We're Halfway There | Complete 25 Ship It! challenges. |
| S-006 | That's All, Folks! | Complete all 50 Ship It! challenges. |
| S-007 | Gotta Catch 'Em All! | Complete at least one challenge in each of the five scavenger categories. |
| S-008 | The Full Monty | Complete every challenge in any one scavenger category. |
| S-009 | The Early Bird Special | Submit a challenge before 10:00 AM Ship Time. |
| S-010 | Night Moves | Submit a challenge after 10:00 PM Ship Time. |
| S-011 | Three's Company | Complete 3 challenges on the same cruise day. |
| S-012 | The Love Boat | Complete a challenge on the first cruise day. |
| S-013 | The Final Countdown | Complete a challenge on the final cruise day before the game ends. |
| S-014 | Why are you even on the ship? | Submit a challenge between 10:00 AM and 4:00 PM Ship Time on a designated port day. |
| S-015 | Three Times a Lady | Complete at least one challenge on 3 different cruise days. |
| S-016 | Quick Draw McGraw | Submit 2 challenges within 30 minutes of each other. |
| S-017 | Wax On, Wax Off | Complete the Lotus Spa Zen challenge. |
| S-018 | Happy Little Accidents | Complete the Art Critic challenge. |
| S-019 | Eye of the Tiger | Complete the Gym Buffs challenge. |
| S-020 | That's Amore! | Complete the Poolside Slice challenge. |
| S-021 | Ice Ice Baby | Complete the Soft Serve Swirl challenge. |
| S-022 | Buffet the Vampire Slayer | Complete the Buffet Multi-Tasker challenge. |
| S-023 | If You Like Piña Coladas... | Complete the Tropical Paradise challenge. |
| S-024 | The Breakfast Club | Complete the Room Service Delivery challenge. |
| S-025 | Don't Worry, Be Buoy | Complete the Safety First challenge. |
| S-026 | Animal House | Complete the Towel Zoo challenge. |
| S-027 | Is This Thing On? | Complete the Lounge Spotlight challenge. |
| S-028 | Wake Me Up Before You Go-Go | Complete the Ocean Wake challenge. |
| S-029 | Take Five | Complete the Crew High-Five challenge. |
| S-030 | I'll Take Cruises for $500, Alex | Complete the Trivia Masters challenge. |
| S-031 | Don't Stop Believin' | Complete the Live Music Backdrop challenge. |
| S-032 | Footloose | Complete the Deck Dance Move challenge. |
| S-033 | The Price Is Right | Complete the Souvenir Selection challenge. |
| S-034 | Don't Let the Sun Go Down on Me | Complete the Sunset Silhouette challenge. |
| S-035 | I'm Flying, Jack! | Complete the King of the World challenge. |
| S-036 | The Mod Squad | Complete the Triple Match challenge. |
| S-037 | Full House | Complete the Chair Squeeze challenge. |
| S-038 | Where in the World Is Carmen Sandiego? | Complete the Comically Lost challenge. |
| S-039 | Honey, I Shrunk the Ship | Complete the Miniature Masterpiece challenge before any other team. |
| S-040 | Irish You Were Here | Complete the O'Malley's Irish Pub challenge before any other team. |
| S-041 | Spirit in the Sky | Complete the Good Spirits Mixology challenge before any other team. |
| S-042 | North by Northwest | Complete the Carpet Compass challenge before any other team. |
| S-043 | Every Rose Has Its Thorn | Complete the Nautical Rose challenge before any other team. |
| S-044 | Friday the 13th | Complete the Deck 13 Mystery challenge before any other team. |
| S-045 | Shadow Dancing | Complete the Shadow Art challenge before any other team. |
| S-046 | Hawaii Five-O! | Be the first team to complete at least one challenge in each of the five scavenger categories. |
| S-047 | Sweep Dreams (Are Made of This) | Be the first team to complete every challenge in any one scavenger category. |
| S-048 | My own kind of paradise | Complete the Tropical Paradise, Sunset Silhouette, and Ocean Wake scavenger challenges. |

## Drink It! — Current achievements (92 active; one blank source row omitted)

| Snapshot ref | Name (exact current text) | Trigger (exact current text) |
| :--- | :--- | :--- |
| D-001 | Wasted away again in Margaritaville | Log your first alcoholic drink. |
| D-002 | Third Time's the Charm | Log 3 drinks across the cruise. |
| D-003 | Light Work | Log 7 drinks across the cruise. |
| D-004 | 15 Minutes of Fame | Log 15 drinks across the cruise. |
| D-005 | The AA meeting is Wednesday | Log 30 drinks across the cruise. |
| D-006 | X Marks the Spot | Claim your first Drink It! bounty of any kind. |
| D-007 | The Usual Suspects | Claim your first Cocktail Bounty. |
| D-008 | Elementary, My Dear Watson | Claim your first Ingredient Bounty. |
| D-009 | This Round is on Me | Claim your first Bar Bounty. |
| D-010 | Your mission should you choose to accept it | Complete your first Daily Challenge. |
| D-011 | Double Kill | Claim 2 different bounty categories with one drink. |
| D-012 | This shouldn’t be possible!! | Claim Cocktail, Ingredient, and Bar Bounties with the same drink. |
| D-013 | Try Harding | Complete all 4 bounty categories on one cruise day. |
| D-014 | Its a marathon, not a Sprint | Claim at least one bounty on 3 different cruise days. |
| D-015 | Catch Me If You Can | Claim Cocktail Bounties on 3 different cruise days. |
| D-016 | What's in the Box?! | Claim Ingredient Bounties on 3 different cruise days. |
| D-017 | All Four One | Claim Bar Bounties on 3 different cruise days. |
| D-018 | Four of a Kind | Claim each of the 4 different bounty categories at least once during the cruise. |
| D-019 | Bar None | Log drinks at 2 different game bars. |
| D-020 | These Boots Are Made for Walkin' | Log drinks at 5 different game bars. |
| D-021 | Life Is a Highway | Log drinks at 10 different game bars. |
| D-022 | I've Been Everywhere, Man | Log at least one drink at all 13 game bars. |
| D-023 | Its kind of a Triathlon | Log drinks at 3 different game bars during one cruise day. |
| D-024 | Repeat Offender | Log drinks at the same bar at least 2 hours apart. |
| D-025 | I’ll have what I’m having | Log the same named cocktail at 2 different game bars. |
| D-026 | Three's Company | Log 3 different named cocktails from one bar across the cruise. |
| D-028 | Gotta Start Somewhere | Log 3 distinct named cocktails. |
| D-029 | It’s called Branching out | Log 8 distinct named cocktails. |
| D-030 | They Serve Other Stuff Here | Log the same named cocktail 3 times across the cruise. |
| D-031 | Oops!... I Did It Again | After claiming a Cocktail Bounty, log the same named cocktail again in a later submission. |
| D-032 | Off the Beaten Path | Log a drink using the 'Other alcoholic drink' option. |
| D-033 | Stuck in Colder Weather | Log a named cocktail classified as frozen. |
| D-034 | Red, Red Wine | Log a drink using the Wine option. |
| D-035 | Can’t beat the classics | Log a drink using the Beer option. |
| D-036 | One of Each, Please | Log at least one named cocktail, one Beer option, and one Wine option. |
| D-037 | The Gintleman | Log 3 cocktails containing gin. |
| D-038 | Tequila Mockingbird | Log 3 cocktails containing tequila. |
| D-039 | Rum, Forrest, Rum! | Log 3 cocktails containing rum. |
| D-040 | Whiskey Business | Log 3 cocktails containing whiskey or bourbon. |
| D-041 | Crystal Clear | Log 5 cocktails containing a clear base spirit. |
| D-042 | Paint It Black | Log 5 cocktails containing a dark base spirit. |
| D-043 | The Fantastic Four | Across logged cocktails, encounter gin, vodka, rum, and tequila. |
| D-044 | Tastes like a Campfire | Log a cocktail containing mezcal. |
| D-045 | Easy Peasy Lemon Squeezy | Log a named cocktail containing lemon or fresh lemon juice. |
| D-046 | Pineapple Express | Log a named cocktail containing pineapple. |
| D-047 | Heard it on the Coconut Telegraph | Log a named cocktail containing coconut or coconut milk. |
| D-048 | Orange You Glad? | Log a named cocktail containing Aperol. |
| D-049 | How do you milk an almond? | Log a named cocktail containing orgeat. |
| D-050 | Disco Inferno | Log a named cocktail containing a hot pepper, jalapeño, serrano, or habanero ingredient. |
| D-051 | Wake Me Up Before You Go-Go | Log a named cocktail containing espresso. |
| D-052 | Flower Power | Log a named cocktail containing elderflower liqueur or St-Germain. |
| D-053 | Amaretto Much? | Log a named cocktail containing amaretto. |
| D-054 | Fa-la-la-la Falernum | Log a named cocktail containing falernum or Velvet Falernum. |
| D-055 | Lychee Me Alone | Log a named cocktail containing lychee or lychee liqueur. |
| D-056 | I'm Blue (Da Ba Dee) | Log a named cocktail containing blue curaçao. |
| D-057 | The Xul Beer is Better | Log a named cocktail containing peanut butter whiskey. |
| D-058 | Beet It | Log a named cocktail containing beetroot. |
| D-059 | Grease Is the Word | Log a named cocktail containing an olive oil-washed spirit. |
| D-060 | Bitter Sweet Symphony | Log a named cocktail containing Campari. |
| D-061 | Anyone got the Thyme? | Log a named cocktail containing basil or rosemary. |
| D-062 | Kitchen Sink Drink | Log a named cocktail with at least 7 separately listed recipe ingredients. |
| D-063 | Double Trouble | Log a cocktail containing at least 2 different base-spirit families. |
| D-064 | Rum and Rum Again | Log a cocktail containing at least 2 distinct rum styles. |
| D-065 | The Wine makes it Classy | Log a named cocktail containing wine, rosé, Prosecco, or Champagne. |
| D-066 | Fruitcakes in the kitchen | Across logged cocktails, encounter at least 3 different fruits from pineapple, mango, passion fruit, guava, dragon fruit, and lychee. |
| D-067 | Three's a Crowd | Log a drink with at least 2 other enrolled Drink It! players. |
| D-068 | We're getting the band back together | Log a drink with at least 5 other enrolled Drink It! players. |
| D-069 | Drinking on Lunch Break | Log a drink with another enrolled player between noon and 1:00 PM Ship Time. |
| D-070 | With a Little Help from My Friends | Log drinks with at least 3 different enrolled companions across the cruise. |
| D-071 | Road Trip! | Log drinks at 3 different bars with the same enrolled companion. |
| D-072 | You Can't Drink All Day Unless You Start in the Morning | Log a drink before 11:00 AM Ship Time. |
| D-073 | After Midnight | Log a drink after 11:00 PM Ship Time. |
| D-074 | Double Take | Submit 2 drink logs within 30 minutes of each other. |
| D-075 | Wish You Were Here | Log a drink during the configured daytime port-hours window. |
| D-076 | Come Sail Away | Log a drink on the first cruise day. |
| D-077 | The Last Hurrah | Log a drink on the final cruise day before the game ends. |
| D-078 | Here We Go Again | Log at least one drink on 3 different cruise days. |
| D-079 | Where everyone knows my name | Log drinks at the same game bar on at least 3 different cruise days. |
| D-080 | Not a worry in the world, cold beer in my hand | Log a drink using the Beer option. |
| D-081 | Dawn of the Peck | Log a drink on Thanksgiving Day (Thursday, according to Ship Time). |
| D-082 | Wrinkles only go where the smiles have been | Across the cruise, log a drink with every other participating Drink It! player selected as a companion at least once. |
| D-083 | Screamin' Boat Drinks | Across the cruise, log every distinct eligible named cocktail on the shared pool-bar menu used for Lido Bar, The MIX, Promenade Bars and Star Bar. Each cocktail counts once regardless of which of those bars served it. |
| D-084 | The menu is more of a guideline anyway | Log a drink using the 'Other alcoholic drink' option. |
| D-085 | Take it to the limit | Earn the maximum attainable daily bounty points across all four categories in one day, including the highest available Cocktail and Ingredient scores and the full eligible Bar group bonus. |
| D-086 | One Peppy Lopez, Please. | Log a tequila-containing named cocktail with David B selected as a companion. |
| D-087 | Wasted away again in Margaritaville | Log a named margarita cocktail with Josh selected as a companion. |
| D-088 | A Pirate Looks at 40 | Log a drink using the Beer option with David F selected as a companion. |
| D-089 | At Least it isn't coors lite | Log any named cocktail with Cindy selected as a companion. |
| D-090 | Feeding the Fishes | Log a rum-containing named cocktail with Jordan selected as a companion. |
| D-091 | This is too sweet for me | Log a bourbon-containing named cocktail with Dan selected as a companion. |
| D-092 | The Wino and I know | Log a drink using the Wine option with Katie selected as a companion. |
| D-093 | Dear Maria, Count me Gin | Log a gin-containing named cocktail with Jonathan selected as a companion. |

## Later re-snapshot / handoff

- When the user finishes editing the Google Doc, **reread it live**, regenerate the catalog, and reconcile additions/removals/name changes with current app implementation. Do not reconstruct it from this Markdown or earlier chat brainstorms.
- Final review can assign permanent IDs, public/secret visibility, Milestones/Firsts/Other grouping, difficulty, icons, notification copy, and exact machine-readable evaluator predicates. None of those have been silently decided in this interim export.
- Keep a clear diff from this interim snapshot so author edits are not lost. Prefer data migrations or catalog versioning over wiping already-awarded achievements.

