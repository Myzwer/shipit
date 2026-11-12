# PC1 — Daily Challenge participation acknowledgment (implemented)

**Status:** Approved Option A — implemented in migration `20261105010800_pc1_daily_attest_participation.sql`.  
**Branch:** `rules/pc1-gameplay-backend` (isolated). Do not apply to organizer Pre-Cruise until merge is approved.

## Server contract

`submit_daily` / `drinkit_submit_daily_core` payload:

```ts
{
  idempotency_key: string
  challenge_id: string
  photo_id: string
  caption: string | null
  attest_participation: true  // required for NEW accepts
}
```

### Validation (new claims only)

| `attest_participation` | Result |
|------------------------|--------|
| missing / false / non-true | `ok: false`, `code: 'ATTEST_PARTICIPATION_REQUIRED'` (mode-specific message) |
| `true` | Proceed with existing eligibility (membership, lifecycle, today-only, photo, one/day, 50 pts) |

Meaning is honor-based from `daily_challenges.participation_mode`:

- **All Hands** — player confirms personal attendance/participation at the announced meetup. Photo may be uploaded later. No upload-time vs meetup comparison. Not all players must attend.
- **Bring a Friend** — player confirms completion with another active Drink It! participant (not necessarily Bar crew). No companion picker / reciprocal log / approval.

Extra keys such as `companion_player_ids` or `attended_at` are **not** part of the fingerprint and are ignored for eligibility (not stored as attendance proof).

### Idempotency / history

- Fingerprint includes `attest_participation` **only when the key is present** (legacy-compatible, same pattern as optional drink `photo_id`).
- Replay of an already-accepted submission returns the original `result_json` before re-checking attestation — including accepts created **before** this contract (4-field payload still matches stored hash).
- One active Daily claim per player/day and 50-point award unchanged.

### Not created

- No attendance table, proof-of-presence, Admin approval queue, face analysis, or companion collection on Daily Claim.

## Frontend integration (required before players can claim)

**Do not silently set `attest_participation` before the final Submit action.**

Approved concise copy above the existing final submission action:

**All Hands:**  
`By submitting, I confirm I attended and participated in today's scheduled meetup.`

**Bring a Friend:**  
`By submitting, I confirm I completed this challenge with another Drink It! player.`

On that existing Submit action only, send:

```ts
await submitDaily({
  idempotency_key,
  challenge_id,
  photo_id,
  caption,
  attest_participation: true,
})
```

No new screen, checkbox, companion selector, or extra button.

### Client type update

```ts
export interface DailySubmitPayload {
  idempotency_key: string
  challenge_id: string
  photo_id: string
  caption: string | null
  attest_participation: true
}
```

Pending-submit recovery must persist and replay the same five-field payload (including `attest_participation: true`) so lost-response recovery still matches the fingerprint.

### Mode source

Use the challenge’s authoritative `participation_mode` from `get_my_current_daily_challenge` (or equivalent home card) to choose which confirmation sentence to show.

## Error handling

On `ATTEST_PARTICIPATION_REQUIRED`, surface the server `message` (or the approved confirmation sentence) and keep the user on the review/submit step — do not invent a second form.
