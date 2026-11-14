# Phase V5A — Daily Challenge Home Card Simplification

Pass A only: Home card content hierarchy. Details/Review redesign deferred to Pass B.

## Hierarchy (active Daily card)

1. All Hands (only when `participation_mode === 'all_hands'`)
2. Points pill
3. Challenge title
4. Venue name (no `Location:` prefix)
5. Structured meetup time when `meeting_time_ship_local` is set (`Meet at 2:30 PM`)
6. **View Details →** (opens existing Daily workflow; does not claim)
7. Footer: Daily Challenge

Removed from Home: instructions, mode explanations, admin announcement text, generic “Available until …”.

## Screenshots (402 × 874 unless noted)

| File | Case |
|---|---|
| `before/all-hands-home-402.png` | Pre-V5A overloaded Daily card (from C2) |
| `after/01-all-hands-card-402.png` | Simplified All Hands card |
| `after/01-all-hands-home-{360,402,430}.png` | Same in carousel at widths |
| `after/02-among-neighbors-402.png` | Daily among neighboring bounties |
| `after/03-details-confirm-402.png` | Details still has full instructions |
| `after/04-meetup-time-card-402.png` | Structured meetup time on Home |
| `after/04-meetup-time-details-402.png` | Meetup time retained on Details |
| `after/05-bring-friend-home-{360,402,430}.png` | No All Hands label; no Bring a Friend eyebrow |
| `after/06-long-title-card-402.png` | Long title fixture |
| `after/07-claimed-home-402.png` | Claimed overlay |
| `after/08-overnight-home-402.png` | Overnight overlay |

## Recapture

```bash
LOCAL_TEST_PASSWORD='…' node scripts/capture-v5a-daily-home-card.mjs http://localhost:5173
```

## Limitations

- Final schedule seeds `meeting_time_ship_local` as `null` for all 7 days.
- Home shows only that structured field. Free-text `admin_announcement` meetup notes stay on Details and are not parsed into Home times.
