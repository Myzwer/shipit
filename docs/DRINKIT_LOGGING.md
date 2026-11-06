# Drink It! logging wizard (Phase 3B–4B4)

Five-step functional wizard: **Bar → Drink → Friends → Photo → Review**.

## Routes

| Path | Purpose |
|---|---|
| `/drinkit/log` | Wizard (`?from=plus\|cocktail\|ingredient\|bar&bar=&offering=`) |
| `/drinkit/daily` | Daily Challenge claim (required photo) |
| `/drinkit/gallery?submission=` | Minimal post-submit stub (not full Gallery) |

Entry: floating Plus, or Cocktail / Ingredient / Bar / Daily **Claim It**.

## Friends / Bar eligibility (product override)

Exactly **one** companion selector. Selected companions are sent as both:

- `companion_player_ids`
- `bar_eligible_companion_ids` (same list)

When the selected bar is today's featured Bar Bounty and that category is still available, Friends shows an informational reminder only. No second list, toggles, or confirmations.

## Photo (Phase 4B4)

Ordinary drink logs: **optional** photo via shared `PhotoCapture`.

- Take / Upload → local preview → stage (`drink_log` purpose) → Review
- Retake / Replace / Remove; continue with no photo (no mandatory warning)
- Caption optional with or without a photo
- Submit sends nullable `photo_id` only — never a client Storage path
- `photo_storage_key` from the client is rejected (`FORGED_PHOTO_PATH`)
- Staging failure keeps the local image for Retry; user may explicitly remove/skip
- Unknown pending outcome locks photo edits so the exact UUID + payload (including `photo_id`) are retried
- Success Gallery stub shows the bound photo via authorized signed URL (square crop for preview only)

Daily Challenge still requires a `daily`-purpose photo (Phase 4B3).

## Ingredient mismatch (Phase 3C-A)

Review link **“My drink has the ingredient bounty but it's not available?”** appears when preview marks Ingredient unavailable with a server `confirmable` hint (named catalog drink at this bar; current Ingredient objective).

Yes → payload includes `confirm_contains_ingredient_key`. Preview becomes eligible when otherwise allowed; default selection applies. Shared `ingredient_corrections` row is written **only** inside a successful Ingredient award transaction (atomically with optional photo bind).

## Unlisted drinks (Phase 3C-A)

Name + broad type. For `named_cocktail`:

- Optional honor Yes/No for the active Ingredient key → `unlisted_contains_ingredient_key` (this submission only; no shared overlay).
- If the featured Cocktail is missing from the picker at its **designated** bar, optional Yes → `confirm_featured_cocktail` (must match name + bar on the server).

Generics never gain Ingredient via confirm fields. Unlisted drinks never enter the Cocktail rotation pool.

## Submit / Retry / pending recovery

- One `idempotency_key` per submission intent
- Before transmit, persist `{ clientRequestId, playerId, cruiseConfigId?, payload, summary }` in `localStorage` (`pendingDrinkSubmit`)
- Payload includes optional `photo_id` when staged; Retry reuses the **exact** UUID and payload
- Reload / browser restart restores the pending intent (player-scoped); account switch / logout clears foreign drafts
- Editing after an unknown outcome is blocked until Retry resolves (including photo replace/remove)
- Confirmed rejection clears pending and allows a new intent
- Success clears pending → Gallery stub

### Daily pending recovery (Phase 4B4 gate)

Unresolved Daily submits restore **independently** of today's active challenge:

- Compact recovery UI works during Pause, after 11 PM, after Friday finale, or on a later cruise day
- Exact original payload + UUID are retried (never silently replaced by a new day's request)
- Successful replay opens the original Gallery entry; definitive rejection clears pending
- Closed Daily window alone is not treated as proof the prior submit failed
- Peer accounts cannot see or overwrite another player's pending request

## Local verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:seed-bounty-now
npm run dev   # separate terminal
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase4b4:daily-recovery
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase4b4
```

## Remaining later

| Phase | Work |
|---|---|
| Gallery | Full feed, filters, reactions, pagination |
| Achievements | Evaluation + reveal |
| Admin Void | Void accepted submissions |
| Media sweeper | Abandoned staging TTL cleanup |
