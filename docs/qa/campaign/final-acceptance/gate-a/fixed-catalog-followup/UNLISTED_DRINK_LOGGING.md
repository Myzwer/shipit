# Unlisted drink logging — existence & E2E proof

## Exists?

**Yes.** Not merely planned:

- UI: Drink step `data-testid="drink-not-listed"` → unlisted form (`unlisted-form`, name, type, optional ingredient/featured honor).  
- Client payload: `mode: 'unlisted_named'` + `custom_name` + `unlisted_drink_kind` (`src/lib/drinkLog/api.ts`, wizard store).  
- Server: submit/preview paths handle `unlisted_named` including optional featured-cocktail and ingredient honor confirms.

## E2E results (disposable `:55321`)

| Scenario | Result |
|---|---|
| Ordinary catalog-listed drink | PASS |
| Unlisted cocktail at physical bar | PASS |
| Optional companion | PASS (backend) |
| Optional caption | PASS |
| Successful submit + confirmation | PASS |
| Gallery / drink_logs visibility after submit | PASS |
| Duplicate idempotency key | PASS (replay, no double row) |
| Interrupted → new key retry | PASS |
| Empty name error recovery | PASS |
| Mobile Order unlisted | PASS (accepted; no venue Cocktail/Bar bounty) |
| Authenticated browser unlisted → gallery | PASS |
| Gallery refresh after browser submit | PASS |

Optional photograph: browser path supports upload when a fixture image exists; this run proved caption-only + backend ordinary logs. No new photo feature was required.

## Bounty / achievement safety

| Check | Result |
|---|---|
| Unlisted without featured confirm → Cocktail bounty | **Not eligible** |
| Unlisted without ingredient honor key → Ingredient bounty | **Not eligible** |
| Wrong-name featured confirm at designated bar | **Not eligible** |
| Mobile Order unlisted → venue Cocktail/Bar | **Not awarded** |
| Ordinary points without claims | No invented bounty points |

Honor paths (exact featured name at designated bar; explicit ingredient key affirm) remain the only unlisted routes to Cocktail/Ingredient eligibility — player-attested, not invented menu chemistry.

## Ordinary log effects (approved rules)

- `drink_mode = unlisted_named` persists on `drink_logs`.  
- Counts as an ordinary accepted log (gallery-visible).  
- Does **not** invent ingredient classifications or menu relationships that are not supplied.  
- Favorites / variety metrics follow existing engine rules for unlisted modes (no fabricated tags in this follow-up).

## Player impact if unlisted were missing

N/A — capability is present. Guests can log menu drinks absent from the frozen catalog via **Log a drink → drink not listed**, including Mobile Order.
