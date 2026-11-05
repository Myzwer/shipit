# Drink It! logging wizard (Phase 3B / 3C-A)

Five-step functional wizard: **Bar → Drink → Friends → Photo → Review**.

## Routes

| Path | Purpose |
|---|---|
| `/drinkit/log` | Wizard (`?from=plus\|cocktail\|ingredient\|bar&bar=&offering=`) |
| `/drinkit/gallery?submission=` | Minimal post-submit stub (not full Gallery) |

Entry: floating Plus, or Cocktail / Ingredient / Bar **Claim It** (Daily remains disabled).

## Friends / Bar eligibility (product override)

Exactly **one** companion selector. Selected companions are sent as both:

- `companion_player_ids`
- `bar_eligible_companion_ids` (same list)

When the selected bar is today's featured Bar Bounty and that category is still available, Friends shows an informational reminder only. No second list, toggles, or confirmations.

## Photo

Photo upload is **not** implemented (Phase 5). The Photo step shows an unavailable notice; captions work; Review shows the branded placeholder. Never sends a fake `photo_storage_key`.

## Ingredient mismatch (Phase 3C-A)

Review link **“My drink has the ingredient bounty but it's not available?”** appears when preview marks Ingredient unavailable with a server `confirmable` hint (named catalog drink at this bar; current Ingredient objective).

Yes → payload includes `confirm_contains_ingredient_key`. Preview becomes eligible when otherwise allowed; default selection applies. Shared `ingredient_corrections` row is written **only** inside a successful Ingredient award transaction.

## Unlisted drinks (Phase 3C-A)

Name + broad type. For `named_cocktail`:

- Optional honor Yes/No for the active Ingredient key → `unlisted_contains_ingredient_key` (this submission only; no shared overlay).
- If the featured Cocktail is missing from the picker at its **designated** bar, optional Yes → `confirm_featured_cocktail` (must match name + bar on the server).

Generics never gain Ingredient via confirm fields. Unlisted drinks never enter the Cocktail rotation pool.

## Submit / Retry / pending recovery

- One `idempotency_key` per submission intent
- Before transmit, persist `{ clientRequestId, playerId, cruiseConfigId?, payload, summary }` in `localStorage` (`pendingDrinkSubmit`)
- Retry after unknown/network reuses the **exact** UUID and payload
- Reload / browser restart restores the pending intent (player-scoped); account switch / logout clears foreign drafts
- Editing after an unknown outcome is blocked until Retry resolves
- Confirmed rejection clears pending and allows a new intent
- Success clears pending → Gallery stub

## Local verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:seed-bounty-now
npm run dev   # separate terminal
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase3b
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase3ca
```

## Remaining later

| Phase | Work |
|---|---|
| 4 | Daily Challenge Claim It |
| 5 | Private photo upload / storage |
| Gallery | Full feed, filters, reactions |
| Achievements | Evaluation + reveal |
