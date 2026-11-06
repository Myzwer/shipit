# Media pipeline (Phase 4B1)

Shared, cruise-Wi-Fi-friendly photo capture and **private staging** for Drink It! and Ship It!.  
**Phase 4B2:** `submit_scavenger` binds a staged scavenger photo atomically with team scoring.  
Still deferred: Daily Challenge submit, optional Drink It! photo bind, full Gallery.

Authority: Tech Spec §7.2–7.4, §9; UX §4 Photo.

## Shared component

`src/components/shared/PhotoCapture.vue`

| Prop | Role |
|---|---|
| `game` | `drinkit` \| `shipit` |
| `purpose` | `drink_log` \| `daily` \| `scavenger` |
| `required` | Shows required hint; enclosing form enforces Continue |
| `autoStage` | Default `true` — optimize then stage immediately |

Obvious actions only: **Take Photo** (`capture="environment"` rear camera where supported) and **Upload Photo** (ordinary file picker). No custom camera UI, filters, crop tools, or stickers.

After selection: preview, Retake, Replace, Remove. Caption stays on the enclosing form (e.g. Drink It! Photo step).

Typed contracts: `src/lib/media/contracts.ts`

- Ordinary drink log — optional photo (bind deferred)  
- Daily — required (Submit not enabled yet)  
- Scavenger — required; `submit_scavenger` binds staged photo

## Staging lifecycle

```
Select/capture → processImageFile → begin_photo_upload
  → Storage upload to reserved path → confirm_photo_upload
  → status=staged (eligible for future submit verify)
```

1. **begin_photo_upload** — server mints `photos` row + path `{player_id}/{game}/{photo_id}.{ext}` under the caller. Client cannot choose another player's prefix.
2. **Storage upload** — authenticated, private bucket `game-photos`, upsert only while `pending_upload`.
3. **confirm_photo_upload** — marks `staged` only if the Storage object exists. Idempotent replay if already staged. Never reports success without a verifiable object.
4. `submit_scavenger` locks the photo row, verifies staged object presence, and binds in the scoring transaction. `verify_staged_photo_for_submit` remains service-role for other futures. A client path alone is not proof.

### Gate A — abandon

`abandon_photo_upload` only marks the ledger `abandoned` + `storage_cleanup_status=pending` under row lock. Physical removal uses the **Storage API** (`remove`), then `mark_photo_storage_cleaned` (or `mark_photo_storage_cleanup_failed`). Staged objects are **not** deletable via Storage policies (prevents delete-during-bind races). Bound photos cannot be abandoned or deleted.

### Gate B — lost upload/confirm

`begin_photo_upload` accepts optional `p_client_request_id` (unique per owner). Lost begin responses replay the same reservation. `PhotoCapture` / `stageProcessedPhoto` emit `onPending` as soon as begin succeeds; Retry reconciles via `get_my_photo` (confirm-only if object already present). Failed replace/retake keeps the previous valid photo until the new file processes successfully.

Safe retry: keep local optimized blob; reuse pending slot (upsert). After browser reload, local `File` may be gone — UI asks to reselect.

## Ownership & Storage security

- Bucket `game-photos` is **private** (`public=false`). No permanent public URLs.
- RLS: players select own `photos` rows; writes only via security-definer RPCs.
- Storage policies: insert/select/update/delete scoped to own player-id folder; update/delete blocked once bound; insert requires matching `pending_upload` ledger row.
- Cross-game: `has_game` + purpose/game pairing (`drink_log`/`daily`→drinkit, `scavenger`→shipit).
- Fixture paths `development-only/%` rejected by table constraint and verify helper.
- Bound photos are immutable (`photos_protect_bound` trigger).
- No service-role key in the frontend.

Gallery access later: signed URLs or RPCs for authorized same-game members — design preserves `game` + ownership for that gate.

## Image optimization

`src/lib/media/processImage.ts` + `constants.ts`

| Limit | Value | Rationale |
|---|---|---|
| Max input | 25 MB | Reject before decode on weak devices |
| Max long edge | 2000 px | Enough for Gallery; cruise Wi-Fi friendly |
| Target optimized | ≤ ~4 MB | Prefer smaller uploads |
| Hard Storage/RPC | 5 MB | Matches bucket `file_size_limit` |
| Output | JPEG ~0.82 quality | Strips GPS EXIF via canvas redraw; keeps aspect ratio |

- JPEG / PNG / WebP: supported.
- HEIC/HEIF: **attempted** via `createImageBitmap`; if the browser cannot decode, clear unsupported message (suggest Camera “Most Compatible”). Do **not** claim universal HEIC without device evidence.
- EXIF orientation: `createImageBitmap(..., { imageOrientation: 'from-image' })` when supported.
- Square Gallery thumbs are **presentation crops only** — saved object stays full-frame uncropped.

## Abandoned staging cleanup

Pending/abandoned objects may accumulate if a player begins upload and never confirms or abandons.

**Later ops job (not shipped):** delete Storage objects + rows where `status in ('pending_upload','abandoned')` and `created_at` older than a safe TTL (e.g. 24–72h). **Never** delete `staged` rows that may still be attached, or any `bound` photo referenced by an accepted submission.

Players may call `abandon_photo_upload` when replacing/removing before bind.

## Final submission verification

`submit_scavenger` locks the photo and binds in the scoring transaction (same checks as `verify_staged_photo_for_submit`). Reject: missing, wrong owner, wrong game/purpose, not staged, missing Storage object, fixture paths, already bound elsewhere. Idempotent replay may reuse a photo already bound to the same accepted submission.

Drink It! wizard still **stages** optional photos but submits `photo_storage_key: null` — attachment deferred.

## Local tests

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm test                                 # includes processImage / PhotoCapture / stagePhoto / contracts
npm run test:integration                 # media.phase4b1 + media.phase4b2.gates + shipit.phase4b2.submit
npm run test:e2e:phase4b1 && npm run test:e2e:phase4b2
```

Security cases: own stage, peer deny, unauthenticated deny, cross-game, forged path, missing object, fixture reject, staged/bound immutability, Storage API abandon (no SQL object delete), lost begin/upload/confirm reuse, no public bucket access.

## Remaining work (after 4B2)

- Bind staged photo inside `submit_drink` / Daily Challenge submit  
- Full Gallery browse, signed download, reactions  
- Abandoned-file TTL sweeper (retain recoverable cleanup state until then)  
- Real-device camera + HEIC confirmation on iPhone/Android over cruise-like networks  

## Outstanding real-device tests

| Behavior | Why Playwright is insufficient |
|---|---|
| Take Photo opens rear camera | `capture="environment"` is browser/OS mediated; file injection ≠ camera UI |
| HEIC from Camera roll | Desktop Chromium often cannot decode HEIC |
| Orientation on physical photos | Device EXIF + browser matrix varies |
| Slow cruise Wi-Fi feel | Need throttled real radio, not only route delays |
