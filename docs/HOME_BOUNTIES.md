# Drink It! Home bounties (Phase 2D-B1)

Player-facing Cocktail and Ingredient cards on Drink It! Home, wired to server-authoritative RPCs.

## Data flow

```text
DrinkItHomeView
  └─ createHomeBountySync()
       ├─ get_my_current_cocktail_bounty()     # zero-arg, server now()
       ├─ get_my_current_ingredient_bounty()   # zero-arg, server now()
       └─ get_ship_clock_state()               # zero-arg, server now()
            ↓
       parse payloads → deriveHomeBoardPhase → mapHomeBountyCards
            ↓
       BountyCarousel (four-card circular swipe)
```

**No client-supplied timestamps.** Device timezone never selects offers. Development fixtures never silently replace missing server data in normal app mode (`DrinkItHomeView` always uses live RPCs).

Bar Bounty and Daily Challenge remain **Phase 0-style shells** until Phase 2D-B2. Claim It is visible but **disabled** until Phase 3.

## Refresh strategy

| Trigger | Behavior |
|---|---|
| Mount / start | Immediate fetch |
| Interval | 60s (cruise Wi-Fi friendly) |
| Visibility → visible | Refresh |
| Window focus | Refresh |
| Public slot / noon boundary | Timeout slightly after `public_end_utc` or next noon |
| Manual Retry | Error banner button |

**Stale responses:** each refresh increments a generation counter; only the latest generation may apply. Older in-flight responses are dropped.

**Network failure:** active offers are cleared. The UI shows an unavailable/reconnect state — it does **not** present a prior offer as definitely current.

**Countdown:** presentation-only tick using `server at_utc` + elapsed ms since fetch. Never adds the hidden 15-minute grace. Crossing a boundary schedules a server refresh.

## Card states

| Phase | Cocktail / Ingredient | Bar / Daily |
|---|---|---|
| `loading` | Loading… | Loading… |
| `active` | Live offer fields | Shell placeholders |
| `pre_open` | Game begins at 12:00 PM + Opens in | Same closed treatment |
| `overnight` | See You Tomorrow + Opens in | Same |
| `paused` | Approved pause copy | Same |
| `finale` | Games ended copy | Same |
| `unavailable` / `error` | Couldn't Load Game Data + Retry | Same |

Active Cocktail shows: name, tier label, fixed points, listed ingredients, `Location: {bar}`, Time Remaining.  
Active Ingredient shows: display name, tier label, fixed points, `Available at {n} bar(s)`, Time Remaining — **never** bar names, cocktail names, or future inventory.

## Local visual / browser verification

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
node scripts/seed-local-bounty-now.mjs          # service-role seed only
npm run dev                                     # separate terminal
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase2db1
LOCAL_TEST_PASSWORD='…' npm run screenshots:phase2db1
```

Screenshots in `docs/phase2db1-screenshots/`:

- `phase2db1-LIVE-*` — live authenticated RPCs
- `phase2db1-MOCKED-*` — Playwright route stubs for overnight/paused/finale UI only (not authorization proof)

Component visual fixtures live in `src/features/drinkit/mockHome.ts` (`visualFixture*` exports) for unit tests — **not** used by the running Home view.

## Remaining (not 2D-B1)

- Phase **2D-B2**: Bar Bounty + Daily Challenge live data
- Phase **3**: Claim It → logging wizard, scoring, claimed-card states
- Admin Skip, production Publish/Rollback, galleries, Ship It! gameplay
