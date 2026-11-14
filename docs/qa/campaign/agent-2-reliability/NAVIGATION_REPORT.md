# NAVIGATION_REPORT — QA-2 Agent 2

## Player-facing route inventory

| Route name | Path | Auth | Notes |
|---|---|---|---|
| login | `/login` | public | Redirect query preserved |
| game-selection | `/` | auth + dual (pre-cruise exception) | Pre-cruise landing |
| drinkit-home | `/drinkit` | auth + drinkit | Awards → wrapped |
| drinkit-rules | `/drinkit/rules` | auth, any member | Pre-cruise allowed |
| drinkit-wrapped | `/drinkit/wrapped` | auth + drinkit | Pre-finale may render unavailable state |
| drinkit-log | `/drinkit/log` | auth + drinkit | Submission; awards remapped |
| drinkit-daily | `/drinkit/daily` | auth + drinkit | Submission; awards remapped |
| drinkit-gallery | `/drinkit/gallery` | auth + drinkit | Pre-cruise blocked |
| drinkit-achievements | `/drinkit/achievements` | auth + drinkit | Pre-cruise blocked |
| shipit-home | `/shipit` | auth + shipit | Awards → wrapped |
| shipit-rules | `/shipit/rules` | auth, any member | Pre-cruise allowed |
| shipit-wrapped | `/shipit/wrapped` | auth + shipit | |
| shipit-challenges | `/shipit/challenges` | auth + shipit | Awards remapped |
| shipit-submit | `/shipit/challenges/:id/submit` | auth + shipit | Photo required |
| shipit-gallery | `/shipit/gallery` | auth + shipit | |
| shipit-achievements | `/shipit/achievements` | auth + shipit | |
| unavailable | `/unavailable` | auth | No enabled games |
| access-denied | `/access-denied` | auth | Missing game membership |
| admin | `/admin` | auth + admin | Out of player cruise critical path |
| catch-all | `*` | → `/` | |

Evidence: `navigation.inventory.spec.ts` + `router.ts`.

## Lifecycle gates (authoritative Ship Clock)

| Lifecycle | Behavior |
|---|---|
| pre_cruise | Gameplay homes, submissions, galleries, achievements, wrapped blocked → game-selection; rules allowed |
| active | Normal gameplay routes |
| awards / finale | Homes + submission routes remapped to Wrapped; gallery/achievements not yanked |

## Submission workflow coverage (client)

### Drink It! log
- Multi-step wizard with pending localStorage recovery, BUSY guard, unknown lock — unit coverage exists (`logWizardNavigation`, drink submit classification).
- Photo optional; staging via PhotoCapture.
- **Gap:** `resetAll` does not abandon staged photo (REL-004).

### Drink It! Daily
- Photo required; attest on final submit; pending recovery.
- **Gap:** no `submitting` re-entry guard inside `performSubmit` (REL-002).
- Discard/abandon path not wired to `abandonPhotoUpload` (suspected; same pattern).

### Ship It! scavenger
- Photo → Review; pending recovery; unknown modal; team-done handling.
- Button disables while `submitting` (component test pass).
- **Gaps:** no in-function re-entry guard (REL-001); start-over / exit discard orphans staged media (REL-003).

## Mobile browser behaviors checked (non-device)

| Topic | Finding |
|---|---|
| Deep link + auth redirect | `redirect: to.fullPath` present |
| scrollBehavior | Always `{ top: 0 }` — may fight mid-wizard scroll; wizard views also force scroll reset on step change |
| Framing editor | `touch-action: none`, pointer capture, `@touchmove.prevent` on overlay — good intent; physical pinch untested |
| Keyboard / iOS viewport | Not executed on device |
| Modal / carousel | Not re-tested in this batch (prior visual QA exists elsewhere) |
| Session persistence | Requires live Auth — blocked safely |

## Requires real auth / device (blocked here)

- Login/logout round-trip against organizer or disposable DB
- Pre-cruise vs active vs awards navigation with live clock
- Browser back during upload / submit with bfcache
- Physical pinch-zoom crop
- Soft keyboard covering Submit on iPhone Safari
- PWA / Add to Home Screen if used

See `UNTESTED.md`.
