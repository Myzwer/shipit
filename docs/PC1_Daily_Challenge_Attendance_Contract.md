# PC1 — Daily Challenge attendance / companionship contract (proposal)

**Status:** Awaiting Development Director approval.  
**Do not implement UI or restrictive schema changes until approved.**

## Current server contract

`submit_daily` / `drinkit_submit_daily_core` accept exactly:

- `idempotency_key`
- `challenge_id`
- `photo_id`
- `caption`

Fingerprint and client type (`DailySubmitPayload`) match those four fields.  
`participation_mode` (`all_hands` | `bring_a_friend`) is stored on `daily_challenges` for display only.  
`meeting_time_ship_local` is null on the final seven rows.  
`admin_announcement` is free-text display only — **not** a machine-readable meetup timestamp.

The claim path does **not** read companionship, attendance, or announcement text.  
A photo uploaded after the meetup is already eligible (no upload-time attendance gate).

## Owner-approved rules (honor system)

| Mode | Requirement |
|------|-------------|
| **All Hands** | Player personally attended and participated at the announced meetup time. Later photo OK. Not all 11 players must attend. |
| **Bring a Friend** | Completed with another active Drink It! participant (not necessarily Bar crew). |

Points remain **50**. No face analysis, reciprocal logging, or Admin-inferred timestamp.

## Gap

Backend cannot record or validate All Hands attendance or Bring a Friend companionship because the claim payload has no attestation / companion field. Existing Drink It! companion selector lives on the drink-log wizard, not Daily Claim.

## Smallest practical honor-based contract (recommended)

**Option A — preferred (no new screen, no second picker):**

Extend `submit_daily` payload with one explicit honor boolean the existing Daily Claim confirmation can set:

```ts
{
  idempotency_key: string
  challenge_id: string
  photo_id: string
  caption: string | null
  // NEW — required true for acceptance; false/missing → clear error
  attest_participation: true
}
```

Server behavior:

- Require `attest_participation === true` for both modes (honor acknowledgment of the mode rules shown on the card).
- Do **not** parse `admin_announcement` as a timestamp.
- Do **not** reject based on claim/upload time vs meetup.
- Fingerprint must include the new field; keep a legacy-hash compatibility path for in-flight retries (same pattern as optional `photo_id`).

Frontend change (owned by Pre-Cruise / Daily Claim agent after approval):

- On the existing Daily Claim review/confirm action, set `attest_participation: true`.
- Optionally show one short honor line already implied by rules copy (“I attended…” / “I completed this with another Drink It! player…”), without a companion picker.

**Option B — Bring a Friend only companion id (heavier):**

Add optional `companion_player_id` validated as another active Drink It! member. Requires UI selection and conflicts with “no second picker / no Daily companion step” guidance. Not recommended unless Director rejects Option A for Bring a Friend.

## Out of scope until approved

- New Daily Challenge form
- Attendance verification / geo / photo analysis
- Invented Admin meetup time column without an approved machine-readable contract
- Inferring attendance from other players’ logs or photos
