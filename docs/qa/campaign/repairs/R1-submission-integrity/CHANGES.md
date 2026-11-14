# R1 — Changes

## Product source

| File | Change |
|---|---|
| `src/stores/drinkLogWizard.ts` | Module-level `drinkSubmitInFlight` coalesce; preserve in-flight key across `resetAll`; reuse durable pending LS before minting; success short-circuit; wrap RPC in latch |
| `src/features/drinkit/log/LogWizardView.vue` | Navigate to gallery **before** `resetAll` on success; allow leave during `submitting` without wiping in-flight key |
| `src/features/drinkit/DailyClaimView.vue` | Early `submitting` latch (REL-002); reuse durable pending key; single try/finally |
| `src/features/shipit/ScavengerSubmitView.vue` | Early `submitting` latch before any await (REL-001); reuse durable pending key |

## Database / RPC

**None.** No migrations. Authoritative rules unchanged:

- `submissions_author_idempotency_unique (author_player_id, idempotency_key)`
- Existing `drinkit_submit_drink_core` / `submit_daily` / `submit_scavenger` idempotent replay

## Tests

| File | Role |
|---|---|
| `tests/unit/qa2-reliability/submissionIntegrity.r1.spec.ts` | **New** — contract guards + remint/coalesce/lost-response/rejection-retry unit |
| `tests/integration/submissionIntegrity.r1.test.ts` | **New** — disposable backend: separate logs, same-key replay, concurrent same-key |
| `tests/unit/qa2-reliability/submitGuards.contract.spec.ts` | Unchanged assertions (REL-001/002 now pass; media still fail for R2) |

## Diagnostic / regression scripts (optional local)

| File | Role |
|---|---|
| `scripts/qa2b/repro-e2b-s07.mjs` | Focused E2B-S07 with RPC key logging |
| `scripts/qa2b/repro-e2b-s07-double.mjs` | Rapid re-tap + nav-away |
| `scripts/qa2b/repro-e2b-s07-iter.mjs` | Multi-variant stress probes |
| `scripts/qa2b/repro-remint-race.mjs` | Forced mid-flight `resetAll` remint race |

## Docs

| File | Role |
|---|---|
| `docs/qa/campaign/repairs/R1-submission-integrity/*` | This repair pack |
| `docs/qa/campaign/consolidation/KNOWN_FAILURE_MANIFEST.md` | Mark REP-SUB-001 repaired; keep media reds |

## Explicitly not changed

- Organizer Supabase `:54321`
- Agent 2 disposable `:56321`
- Scoring rules, catalog, achievements, Wrapped, Admin
- Photo abandon / AbortSignal (R2 / REP-MEDIA-001)
- Signed URL refresh (R3)
