# SUMMARY — QA-2 Agent 2 → Development / QA Director

**Mission:** Player-facing media, connectivity, navigation, and submission reliability before cruise.  
**Checkpoint / worktree:** `5a95c98` on `test/qa2-reliability` at `Ship-It-qa2-reliability`.  
**Isolation held:** No mutations to `:54321` or `:55321`. No Docker changes. No app source repairs. No shared Agent 1 registry edits.

## Counts

| Metric | Value |
|---|---|
| Unique meaningful cases | **81** (69 executed + 12 blocked) |
| Executed | **69** |
| Passed | **60** |
| Failed | **9** (map to **8** unique `REL-*` defects) |
| Blocked | **12** |
| Confirmed P0 | **0** |
| Confirmed P1 | **6** (REL-001, 002, 003, 005, 007, 008) |
| Confirmed P2 | **1** (REL-004) |
| Confirmed P3 | **1** (REL-006) |

## Top five cruise-usability risks

1. **Gallery photos die after ~1 hour** (REL-008) — signed URL loaded once; no refresh/`@error` reload. Guests leaving the gallery open or returning to a backgrounded tab see broken images.
2. **Upload cancel is incomplete** (REL-005) — AbortSignal never reaches Storage PUT; leaving mid-upload on flaky Wi-Fi is ambiguous.
3. **Draft discard orphans staged media** (REL-003 / REL-004) — Start Over / Exit / wizard reset clear UI but do not `abandonPhotoUpload` → storage/ledger clutter (cleanup runner is a backstop, not guest recovery).
4. **Remount + Retry can upload an empty blob** (REL-007) — restore placeholder `new Blob()`; risk of failed or corrupt stage after navigation remounts PhotoCapture.
5. **Double-tap Submit race on Scavenger & Daily** (REL-001 / REL-002) — no in-function in-flight guard (Drink log has `BUSY`). Server idempotency usually saves scores; UX/pending state still fragile on slow ship Wi-Fi.

## Real code vs mocks

| Kind | What |
|---|---|
| Real production code under test | `processImage`, `framing`, `stagePhoto`, `submitDrink`, router meta, Vue components (`PhotoCapture`, `PhotoFramingEditor`, `ScavengerReviewStep`) |
| Mocks | Supabase RPC/Storage, `createImageBitmap`/canvas for image decode, no live network |
| Static contracts | Source/migration reads asserting guards, abandon calls, signed-URL refresh |
| Not claimed | Backend integration, cruise Wi-Fi, physical touch |

## Could not perform safely

- Any live Storage/Auth/clock integration against organizer `:54321` or Agent 1 disposable `:55321`
- Physical iPhone HEIC / pinch crop / Safari bfcache
- Long gallery soak (static defect already filed)

## Files created (worktree only)

**Reports**

- `docs/qa/campaign/agent-2-reliability/MEDIA_REPORT.md`
- `docs/qa/campaign/agent-2-reliability/NETWORK_RECOVERY.md`
- `docs/qa/campaign/agent-2-reliability/NAVIGATION_REPORT.md`
- `docs/qa/campaign/agent-2-reliability/DEFECTS.md`
- `docs/qa/campaign/agent-2-reliability/TEST_REGISTRY.json`
- `docs/qa/campaign/agent-2-reliability/UNTESTED.md`
- `docs/qa/campaign/agent-2-reliability/SUMMARY.md`
- `docs/qa/campaign/agent-2-reliability/vitest-qa2-run.txt`
- `docs/qa/campaign/agent-2-reliability/vitest-qa2-results.json`

**Tests (new)**

- `tests/unit/qa2-reliability/mediaLimits.contract.spec.ts`
- `tests/unit/qa2-reliability/processImage.qa2.spec.ts`
- `tests/unit/qa2-reliability/framing.extreme.spec.ts`
- `tests/unit/qa2-reliability/stagePhoto.network.spec.ts`
- `tests/unit/qa2-reliability/submitGuards.contract.spec.ts`
- `tests/unit/qa2-reliability/gallerySignedUrl.contract.spec.ts`
- `tests/unit/qa2-reliability/navigation.inventory.spec.ts`
- `tests/unit/qa2-reliability/PhotoCapture.restore.spec.ts`
- `tests/unit/qa2-reliability/drinkSubmit.unknown.spec.ts`
- `tests/unit/qa2-reliability/PhotoFramingEditor.gestures.spec.ts`
- `tests/unit/qa2-reliability/scavengerSubmitButton.spec.ts`

## Application source modified?

**No.** Only QA tests + reports under this Agent 2 worktree.

## Recommended fix order (for later — not done here)

1. REL-008 gallery URL refresh / `@error`  
2. REL-007 restore/retry empty-blob guard  
3. REL-005 pass `signal` into `storage.upload`  
4. REL-003/004 abandon on discard/reset  
5. REL-001/002 submit in-flight guards  
6. REL-006 empty-MIME extension denylist  

Re-run `npx vitest run tests/unit/qa2-reliability` after fixes; failing contracts should flip to green without weakening assertions.
