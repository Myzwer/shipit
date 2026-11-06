# Media pipeline (Phase 4B1)

Shared, cruise-Wi-Fi-friendly photo capture and **private staging** for Drink It! and Ship It!.  
**Phase 4B2:** `submit_scavenger` binds a staged scavenger photo atomically with team scoring.  
**Phase 4B3:** `submit_daily` binds a staged `daily` photo atomically with a 50-point Daily claim.  
Still deferred: optional Drink It! drink-log photo bind, full Gallery.

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
- Daily — required; `submit_daily` binds staged photo  
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

## Abandoned staging cleanup (Phase 5C)

Pending/abandoned objects may accumulate if a player begins upload and never confirms or abandons.

**Service-role runner (shipped; schedule at deploy):** `npm run ops:photo-cleanup` → `scripts/run-photo-cleanup.mjs`.

| Rule | Detail |
|---|---|
| TTL | Default **72 hours** (`PHOTO_CLEANUP_TTL_HOURS`); only `created_at` older than cutoff |
| Candidates | Unbound `pending_upload` (promoted to abandoned) or `abandoned` with `storage_cleanup_status` in `pending`/`failed` |
| Never delete | `staged`; any `bound` (including voided-submission audit retain); client-supplied paths (ledger only) |
| Physical delete | Supabase **Storage API** `remove` only — never SQL `DELETE` on `storage.objects` |
| Claiming | `claim_photo_cleanup_batch` (service_role) uses `FOR UPDATE SKIP LOCKED` + `cleanup_claim_token` |
| Complete / fail | `complete_photo_cleanup` / `fail_photo_cleanup`; missing objects reconcile as cleaned; failures stay retryable |
| Bind race | If photo becomes bound before complete → `PHOTO_BOUND_PRESERVED`, cleanup cleared, object kept |
| Credentials | Service-role key **env only** — never browser / Vite bundle |

**Production scheduling prerequisite:** configure cron or CI with `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. The runner is implemented and tested locally; it is **not** running in production until that schedule is configured.

Players may call `abandon_photo_upload` when replacing/removing before bind.

## Final submission verification

`submit_scavenger`, `submit_daily`, and `submit_drink` lock the photo and bind in the scoring transaction (same checks as `verify_staged_photo_for_submit` / `drinkit_lock_staged_photo_for_bind`). Reject: missing, wrong owner, wrong game/purpose, not staged, missing Storage object, fixture paths, already bound elsewhere. Idempotent replay returns the original result before re-lock; a photo already bound to a **different** submission cannot be reused.

Drink It! ordinary logs (Phase 4B4): optional `photo_id` with purpose `drink_log`. No-photo payloads omit `photo_id` so legacy fingerprints still match. Client `photo_storage_key` is always null and non-null values are rejected.

## Local tests

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm test                                 # includes processImage / PhotoCapture / stagePhoto / contracts
npm run test:integration                 # media + shipit + drinkit.phase4b3/4b4 photo suites
npm run test:e2e:phase4b1 && npm run test:e2e:phase4b2
npm run test:e2e:phase4b4:daily-recovery && npm run test:e2e:phase4b4
```

Security cases: own stage, peer deny, unauthenticated deny, cross-game, forged path, missing object, fixture reject, staged/bound immutability, Storage API abandon (no SQL object delete), lost begin/upload/confirm reuse, no public bucket access.

## Gallery photo access (Phase 5A)

Bound photos are readable by **same-game members** (Drink It! Everyone / Ship It! Everyone). Signed URL RPCs + Storage policies enforce this; staged/abandoned/fixture/cross-game remain private. See `docs/GALLERY.md`.

## Remaining work (after 5C)

- **Ops:** schedule `ops:photo-cleanup` in the deployment environment (not claimed running until configured)
- Real-device camera + HEIC confirmation on iPhone/Android over cruise-like networks  

## Outstanding real-device tests

| Behavior | Why Playwright is insufficient |
|---|---|
| Take Photo opens rear camera | `capture="environment"` is browser/OS mediated; file injection ≠ camera UI |
| HEIC from Camera roll | Desktop Chromium often cannot decode HEIC |
| Orientation on physical photos | Device EXIF + browser matrix varies |
| Slow cruise Wi-Fi feel | Need throttled real radio, not only route delays |
