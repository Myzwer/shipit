# MEDIA_REPORT — QA-2 Agent 2 (Player reliability & media)

**Checkpoint:** `5a95c98` / `pre-qa1-checkpoint-2026-11-14`  
**Worktree:** `/Users/josh/Documents/Web Projects/Vue/Ship-It-qa2-reliability` (`test/qa2-reliability`)  
**Scope:** Non-mutating unit + static contracts. No shared DB writes. No app source changes.

## Pipeline inventory (production code)

| Stage | Implementation |
|---|---|
| Picker | `PhotoCapture.vue` — Take Photo (`capture=environment`, `accept=image/*,.heic,.heif`) + Upload Photo (explicit JPEG/PNG/WebP/HEIC) |
| Validate + optimize | `processImage.ts` → JPEG, max long edge 2000px, quality 0.82 with step-down |
| Square crop | `PhotoFramingEditor.vue` + `framing.ts` — non-destructive zoom/pan; persisted via `set_photo_framing` |
| Stage | `stagePhoto.ts` — `begin_photo_upload` → Storage `upload` → `confirm_photo_upload` |
| Bind | Submit RPCs (`submit_drink` / `submit_daily` / `submit_scavenger`) bind `photo_id` |
| Render | `FramedPhoto.vue` + gallery signed URLs (`create_*_photo_signed_url`, 3600s) |

## Limits (from code + migrations — not guessed)

| Limit | Value | Source |
|---|---|---|
| Input reject | 25 MiB | `MEDIA.maxInputBytes` |
| Optimized target | 4 MiB | `MEDIA.maxOptimizedBytes` |
| Storage / RPC hard | 5 MiB (5_242_880) | `MEDIA.storageMaxBytes`, `photos.byte_size` check, bucket `file_size_limit` |
| Global Supabase storage | 50 MiB | `supabase/config.toml` (higher than bucket) |
| Accepted input MIME | jpeg, png, webp, heic, heif | `MEDIA.acceptedInputMime` |
| Stored MIME | jpeg/png/webp only (client always emits jpeg) | bucket + `begin_photo_upload` |
| Framing zoom | 1–4 | `PHOTO_FRAMING_MIN/MAX_ZOOM` |

## Format / processing results

| Scenario | Result | Evidence |
|---|---|---|
| JPEG / PNG / WebP | Pass — decode → JPEG out | `processImage.qa2.spec.ts` |
| Portrait / landscape / square / 8000² | Pass — long-edge scale | same |
| HEIC decode success | Pass (mocked Safari path) | same |
| HEIC decode fail | Pass — clear “Most Compatible” message | same |
| Empty / oversized / GIF+mime / BMP / PDF / corrupt | Pass — clear `MediaProcessError` codes | same |
| Exact `maxInputBytes` | Pass | same |
| `OUTPUT_TOO_LARGE` when encode stays >5MiB | Pass | same |
| Unicode filenames | Pass — preserved on processed result | same |
| Empty MIME + `.gif` | **FAIL** — accepted and converted to JPEG | REL-006 |
| Original file preservation | By design: original not stored; optimized JPEG only; framing non-destructive of optimized image | code review |
| Square “thumbnail” file | N/A — CSS framing, no separate thumb blob | code review |
| EXIF orientation | Intended via `createImageBitmap(..., imageOrientation: 'from-image')` with HTMLImage fallback | unit-mocked only |
| iPhone HEIC reliability | Depends on browser decode; failure path is clear | blocked: real device |

## Crop workflow

| Check | Result | Notes |
|---|---|---|
| Square framing math (pan/zoom clamps) | Pass | `framing.extreme.spec.ts` + existing `photoFraming.spec.ts` |
| Extreme aspects (4k×500, 500×4k) | Pass | no empty letterbox under clamp |
| Editor UI / wheel zoom / accept-cancel | Pass (jsdom) | `PhotoFramingEditor.gestures.spec.ts` |
| Pinch / drag on real touch | **Untested** | Pointer handlers present; not physical-device verified |
| Cancel keeps prior accepted photo | Implemented in `PhotoCapture.onEditorCancel` | covered by existing PhotoCapture specs |

## Upload pipeline reliability (mocked)

| Check | Result | Evidence |
|---|---|---|
| Pending emitted before upload | Pass | `stagePhoto.network.spec.ts` |
| Offline begin blocked | Pass | same |
| Network upload → `NETWORK` + retry copy | Pass | same |
| Confirm `ok:false` not treated as success | Pass | same |
| Duplicate object → confirm | Pass | same |
| Lost confirm reconcile | Pass | same + existing `stagePhoto.spec.ts` |
| AbortSignal before begin | Pass | same |
| AbortSignal passed to `storage.upload` | **FAIL** | REL-005 |
| Remount restore + Retry with empty blob | **FAIL** | REL-007 |
| Gallery signed URL refresh / `@error` reload | **FAIL** | REL-008 |

## iPhone photo acceptance (assessment)

- **Safari / iOS:** HEIC likely decodes; client converts to JPEG before upload — designed path.
- **Non-Safari WebViews / some Android Chrome:** HEIC may fail with explicit guidance to use “Most Compatible” JPEG — not treated as a product bug if users see that message.
- **Library Upload accept list** includes HEIC/HEIF; **Take Photo** uses `image/*` (broader).

## Application source modified?

**No.**
