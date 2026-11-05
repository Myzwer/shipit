# Drink It! logging wizard (Phase 3B)

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

## Unlisted drinks

Basic name + type fallback for ordinary logs. Ingredient confirmation / featured Cocktail special eligibility deferred to **Phase 3C**.

## Submit / Retry

- One `idempotency_key` per submission intent
- Retry after unknown/network reuses the **same** UUID and payload
- Editing after an unknown outcome is blocked until Retry resolves
- Success → Gallery stub with the saved submission

## Local verify (no-photo scoring)

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:seed-bounty-now
npm run dev   # separate terminal
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase3b
```

## Remaining later

| Phase | Work |
|---|---|
| 3C | Ingredient mismatch confirmation + catalog correction; featured unlisted Cocktail path |
| 4 | Daily Challenge Claim It |
| 5 | Private photo upload / storage |
| Gallery | Full feed, filters, reactions |
| Achievements | Evaluation + reveal |
