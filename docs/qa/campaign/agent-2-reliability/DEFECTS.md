# DEFECTS — QA-2 Agent 2 (confirmed)

Defect IDs are stable `REL-*`. No application fixes applied this assignment.

---

## REL-001 — P1 — Ship It scavenger double-submit re-entry

- **Feature:** Ship It! submission
- **Expected:** `performSubmit` returns immediately if a submit is already in flight (same pattern as Drink log `BUSY`).
- **Actual:** Guard is only UI `:disabled="submitting"`; function has no `if (submitting.value) return`. After the first `await`, a second invocation can run.
- **Repro:** Open scavenger review with staged photo → double-tap Submit rapidly (or invoke `performSubmit` twice before first settles).
- **Evidence:** `tests/unit/qa2-reliability/submitGuards.contract.spec.ts` (failed expect for early return).
- **Shared root cause:** Submission screens rely on button disable without store-level in-flight lock (shared with REL-002).
- **Blocks further testing?** No (idempotency usually prevents duplicate scores; still a reliability defect).

## REL-002 — P1 — Drink It Daily double-submit re-entry

- **Feature:** Drink It! Daily claim
- **Expected:** Early return while `submitting`.
- **Actual:** Same gap as REL-001 in `DailyClaimView.performSubmit`.
- **Repro:** Double-tap Daily Submit during in-flight RPC.
- **Evidence:** `submitGuards.contract.spec.ts`
- **Shared root cause:** With REL-001
- **Blocks further testing?** No

## REL-003 — P1 — Scavenger Start Over / Exit discard orphans staged Storage

- **Feature:** Ship It! photo staging cleanup
- **Expected:** Discarding a draft calls `abandonPhotoUpload` (ledger + Storage remove), matching PhotoCapture Remove.
- **Actual:** `confirmStartOver` and `onBeforeUnmount` discard clear local state / pending submit only. No `abandonPhotoUpload` import or call.
- **Repro:** Stage a photo → Start Over or Exit+Discard → inspect `photos` / `storage.objects` (isolated DB later).
- **Evidence:** `submitGuards.contract.spec.ts` (missing `abandonPhotoUpload` in ScavengerSubmitView).
- **Shared root cause:** Wizard-level discard bypasses PhotoCapture `clearLocal` abandon path (also REL-004).
- **Blocks further testing?** No for client unit; blocks clean media quota assumptions on device.

## REL-004 — P2 — Drink log `resetAll` orphans staged photo

- **Feature:** Drink It! log wizard reset
- **Expected:** Reset abandons staged remote photo when clearing `stagedPhoto`.
- **Actual:** `resetAll` nulls local refs only; no abandon.
- **Repro:** Stage optional drink photo → exit/start over that calls `resetAll`.
- **Evidence:** `submitGuards.contract.spec.ts`
- **Shared root cause:** With REL-003
- **Blocks further testing?** No

## REL-005 — P1 — AbortSignal not forwarded to Storage upload

- **Feature:** Photo upload cancel / navigation during PUT
- **Expected:** `stageProcessedPhoto({ signal })` aborts the in-flight `storage.upload`.
- **Actual:** Signal checked before begin/upload, but `upload(path, blob, { contentType, upsert, cacheControl })` omits `signal`.
- **Repro:** Unit mock asserting `opts.signal` — fails. Product: leave page mid-upload; PUT continues.
- **Evidence:** `stagePhoto.network.spec.ts`
- **Shared root cause:** Incomplete abort wiring (pre-checks only).
- **Blocks further testing?** Partially — mid-upload cancel scenarios cannot be validated cleanly.

## REL-006 — P3 — Empty MIME + `.gif` bypasses format gate

- **Feature:** `processImageFile` validation
- **Expected:** Unsupported formats rejected even when `file.type` is blank (common mobile quirk).
- **Actual:** Empty MIME skips `acceptedInputMime` check; GIF decode can succeed → uploaded as JPEG.
- **Repro:** `new File([...], 'party.gif', { type: '' })` → resolves instead of `UNSUPPORTED_FORMAT`.
- **Evidence:** `processImage.qa2.spec.ts`
- **Likely impact:** Low for cruise (users rarely pick GIF); still incorrect validation.
- **Blocks further testing?** No

## REL-007 — P1 — PhotoCapture restore + Retry can upload empty Blob

- **Feature:** Photo remount restore / retry
- **Expected:** Retry after remount either no-ops safely or refuses until a real file is reselected; never uploads `new Blob()`.
- **Actual:** `applyRestore` sets `blob: new Blob()` and `byteSize: staged?.byteSize ?? 1`. Restore without staged → `ready_local`; `retryUpload` → `runStage` → `stageProcessedPhoto` with empty blob.
- **Repro:** Mount PhotoCapture with restore preview and `staged: null` → `retryUpload()` → mock receives `blob.size === 0`.
- **Evidence:** `PhotoCapture.restore.spec.ts`
- **Shared root cause:** Restore placeholder blob without a “local bytes missing” guard on stage.
- **Blocks further testing?** Yes for remount+retry media paths until fixed or guarded.

## REL-008 — P1 — Gallery signed URLs never refresh / reload on error

- **Feature:** Gallery photo rendering
- **Expected:** Refresh before 3600s expiry and/or `@error` → re-fetch signed URL.
- **Actual:** `GalleryPostCard` loads once on mount; no timer; no `@error` reload handler.
- **Repro:** Stay on gallery >1h or open stale tab → broken images until remount/navigation recreates component.
- **Evidence:** `gallerySignedUrl.contract.spec.ts`
- **Cruise impact:** High for guests browsing / leaving tabs open on ship Wi-Fi.
- **Blocks further testing?** No for short sessions; blocks long-session gallery QA.

---

## Suspected risks (not confirmed failed tests)

| ID | Severity | Risk |
|---|---|---|
| RISK-A | P2 | `navigator.onLine` false positives/negatives on ship Wi-Fi |
| RISK-B | P2 | DailyClaim discard paths likely same orphan pattern as REL-003 (no abandon usage found) |
| RISK-C | P2 | HEIC on non-Safari browsers — mitigated by message, still guest friction |
| RISK-D | P3 | Global router `scrollBehavior` top:0 vs wizard scroll resets / keyboard |
| RISK-E | P2 | Original camera bytes not retained (by design) — cannot re-encode later if framing-only adjust needs source |

## Untested scenarios

See `UNTESTED.md` — not listed as defects.
