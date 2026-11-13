# Mobile Order (virtual logging source)

Ordinary Drink It! logging can record drinks ordered through the Princess app (**Mobile Order**), without claiming a physical bar visit.

## Behavior

- Selector: final option in the bar/location list (`canonical_key`: `mobile-order`, `is_virtual: true`).
- Drink step: searchable distinct catalog drink concepts across physical bars (deduped by `drink_concept_id`).
- Representative `offering_id` is only a concept/ingredient snapshot source — **not** an OceanNow availability claim.
- Companions, captions, photos, crop, Gallery (`bar_name` = “Mobile Order”), idempotent submit: unchanged ordinary-log path.
- Solo ordinary logs remain allowed.

## Data model

| Piece | Role |
|---|---|
| `bars.is_virtual` + row `mobile-order` | Stable virtual identity (not a venue) |
| `mobile_order_menu_concepts` | Optional verified menu. **Empty** ⇒ unrestricted distinct-concept search. **Any active rows** for the catalog version ⇒ restrict picker + resolve |
| `list_drinkit_mobile_order_drinks()` | Wizard drink list for Mobile Order |
| `drinkit_resolve_drink_input` | Allows physical-bar offerings when logging against the virtual bar |

Mobile Order is **not** added as an active catalog venue with duplicated offerings (no broad catalog rebuild).

## Scoring / eligibility

| Category | Mobile Order |
|---|---|
| Ordinary log | Allowed |
| Bar Bounty | Ineligible (`not_featured_bar`) |
| Cocktail Bounty (designated offering / bar) | Ineligible (offering/bar mismatch) |
| Ingredient Bounty | **Blocked** (`virtual_order_source`) until a separate product rule |
| Daily Challenge | Separate submit path; location text only |
| Buddy requirement for scored bounties | Preserved |

## Achievements

Physical-bar conditions ignore `is_virtual` bars (distinct bars, bars same day, same cocktail distinct bars, distinct cocktails one bar, same-bar intervals, companion distinct bars). Drink/ingredient variety still counts from the log.

Bar Gauntlets remain per physical bar offerings; Mobile Order does not create a gauntlet venue.

## Gallery

`display_snapshot_json.bar_name` / `drink_logs.bar_display_name` = **Mobile Order**.

## Wrapped (stats only — no UI redesign)

`wrapped_di_log_rows` nulls `bar_id` for virtual logs so:

- DI-P11 / DI-G09 bars visited
- DI-P15 favorite bar
- DI-C08 most popular bar

do not treat Mobile Order as a venue. Drink variety / log counts still include these rows. DI-C09 least-visited uses active `catalog_version_bars` only (virtual bar is not seeded there).

## Enable in organizer environment

1. Confirm disposable/dev cruise (not production; not mid-Wrapped review unless approved).
2. Apply migration `20261105010900_mobile_order_virtual_source.sql` (do **not** `db reset` over Wrapped fixtures).
3. Smoke: Mobile Order last in list → search deduped concepts → solo named log → Gallery shows Mobile Order → physical bar log unchanged.
4. Optional later: populate `mobile_order_menu_concepts` for a verified OceanNow set.

## Ingredient bounty rule (open)

Smallest safe default shipped: **exclude** Mobile Order from Ingredient eligibility and confirmable overlays. Revisit if product wants honor-confirm or menu-backed eligibility without broadening silently.
