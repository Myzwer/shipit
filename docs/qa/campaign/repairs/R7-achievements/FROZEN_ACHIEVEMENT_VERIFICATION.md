# R7 — Frozen achievement verification (ACH-001)

## Menu / catalog evidence

| Drink | Menu source | Frozen? | Tropical under engine rules? |
|---|---|---|---|
| **Frozen Aperol Spritz** | Explicit “Frozen …” on beverage source | **Yes** (name + source) | **No** — orange/citrus only; no tropical ingredient tags |
| Truly Pineapple & Coconut Daiquiri | Named daiquiri; pineapple/coconut | **Not stated as frozen** | Ingredients carry tropical tags — but **cannot** tag `frozen` without inventing |
| Other catalog drinks | — | No other “Frozen …” lines | — |

Daily challenge copy mentions a “frozen Miami Vice”; **no Miami Vice drink** exists in launch-candidate.

## Classification decision

1. **Applied:** `classification_tags: ["frozen"]` on `frozen-aperol-spritz` in launch-candidate + development-preview (approved drink tag vocabulary).
2. **Applied:** `verification_required: true` on Frozen Concoctions + License to Chill.
3. **Not applied:** Any tropical-frozen inventing. Threshold-3 / full_menu tropical universes remain empty until organizer confirmation.

## Expected earnability after content repair

| Achievement | JSON / engine | Earnable now? |
|---|---|---|
| D-033 Stuck in Colder Weather (`tag_match` frozen) | Frozen tag present | **Yes** after catalog publish includes the tag |
| Frozen Concoctions (3 distinct frozen **tropical**) | Gated; target 0 | **No** — organizer list required |
| License to Chill (all frozen **tropical**) | Gated; target 0 | **No** — organizer list required |

Phantom unlocks remain prevented (`target < 1` → not met; verification_pending).

## Unit vs live DB

- **Unit audit ACH-001:** **PASS** (launch JSON publishes `frozen`).
- **Live probe ACH-001-ACTIVE-CATALOG:** Still empty on qa2 because active pointer was `dev-fixture-schedule-ready-v1` (**no** frozen-aperol concept). Content fix is in launch JSON; **republish launch-candidate-v1** required for live unlock proof.
- **WHATIF engine-with-tags:** BLOCKED on fixture (no tropical candidate pool). Prior QA-4A proved engine awards when temporary frozen tags exist on tropical offerings.

## Smallest organizer decision

Provide an explicit list of launch-candidate drink keys that are **frozen tropical** (or confirm none for launch). Until then, keep the two collections verification-gated and guest-facing as pending — do not treat them as cruise-complete.
