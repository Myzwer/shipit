# Phase V5B — Daily Challenge Details + Home CTA centering

## Changes

1. **Home CTA** — `View Details` is centered in the full pill; arrow is independently right-aligned. Button size/position unchanged.
2. **Details header** — Exit (→ Drink It! Home) + Switch Game (dual-game only). No Ship Time row. Non-sticky magenta header.
3. **Details hierarchy** — Identity mint card → meetup row (if structured time) → What to Do → Continue to Photo.

## Screenshots

| File | Notes |
|---|---|
| `before/home-card-402.png` | V5A Home card (pre-centering) |
| `before/details-402.png` | Pre-redesign Details wall of text |
| `after/01-home-card-402.png` | Centered View Details label |
| `after/02-details-no-meetup-{360,402,430}.png` | Details without meetup |
| `after/03-details-meetup-402.png` | `Meet at 3:00 PM · Lido Bar` |
| `after/04-header-exit-switch-{360,402}.png` | Exit + Switch Game |
| `after/05-details-long-instructions-*.png` | Longer instructions (Switcheroo) |
| `after/06-capture-step-402.png` | Continue to Photo opens capture |

## Recapture

```bash
LOCAL_TEST_PASSWORD='…' node scripts/capture-v5b-daily-details.mjs http://localhost:5173
```

## QA notes

- Home label centering delta ≈ 0px (measured).
- Exit → `/drinkit`; Switch Game → `/shipit` for dual-game Josh.
- All Hands shown once; mode hint removed.
- Structured `meeting_time_ship_local` only for meetup row.
