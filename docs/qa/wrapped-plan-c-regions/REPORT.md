# Wrapped Plan C — Final Card Layout Refinement (Three Regions)

**Captured:** 2026-11-13  
**Fixture:** plan-c-full (unchanged)  
**Accounts:** Drink It! David F. (15), Ship It! Katie (12)

---

## Change summary

### Stat cards (`WrappedStoryCard.vue`)

CSS Grid body with three anchored regions:

| Region | Role | Placement |
|---|---|---|
| TOP | Intro (headline + lead) | `auto` row, near top |
| MIDDLE | Single feature **or** paired double reveals | `minmax(0, 1fr)`, content centered in the band |
| BOTTOM | Support / optional double footer | `auto` row, near bottom |

- Short / double-compact use **two rows only** (`auto / 1fr`) — no empty footer reserved.
- Inner labels, paragraphs, and the two double reveals stay grouped (`gap: 1.05rem` between reveals). No `space-between` on individual lines.
- Font sizes and solid warm/cool fills unchanged.

### Photo cards (`WrappedPhotoCard.vue`)

Separate from the stat-card grid:

- Clearer gap from intro → Polaroid (`margin-top: 1.05rem`)
- More white frame padding around the square image
- More space above the caption; keep 3-line clamp + Gallery for full caption
- Square remains prominent (`14.75rem` max)

---

## Measured results (402px)

| Metric | Value |
|---|---|
| Locked card height | **481px** (photo-driven; slightly above 470 where Polaroid breathing room needs it) |
| Intro top pad | **15px** (consistent) |
| Support bottom pad | **18px** (consistent) |
| Grid rows (DI-01 full) | `~59 / 287 / 47` → top / flexible mid / bottom |
| Grid rows (DI-07 / DI-12) | `auto / 1fr` only (no footer row) |
| Double reveal gap | **17px** |
| Photo frame | **215px** square |
| Intro → Polaroid | **17px** (+ frame padding) |
| Frame → caption | **12px** |

360px Drink It! lock also **481px**.

---

## Screenshots

`docs/qa/wrapped-plan-c-regions/`

- `verify-402-DI-01.png` — Your Week (top / centered 9 / bottom)
- `verify-402-DI-02.png` — You've Got Taste
- `verify-402-DI-04.png` — Your Hangouts
- `verify-402-DI-07.png` — Your Best Days (paired mid)
- `verify-402-DI-14.png` — Early Birds & Night Owls
- `verify-402-DI-03.png` — Photo Polaroid
- `final-shipit-katie-402-SI-01.png` — dense Ship single
- `final-shipit-katie-402-SI-04.png` — Ship double
- Matching `verify-360-*.png` for key Drink slides

---

## Tests

| Check | Result |
|---|---|
| `npx vitest run tests/unit/wrappedPlanCSlides.spec.ts` | **PASS** 38/38 |
| `npm run qa:wrapped-plan-c-coverage` | **PASS** 15/15 + 12/12 |

Uncommitted. No fixture / clock / eligibility / carousel mechanic changes.
