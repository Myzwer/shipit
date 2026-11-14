# R8 — Root causes

## REP-MIME-001 / REL-006

**Cause:** `processImageFile` only ran the MIME allowlist when `file.type` was non-empty. Empty or generic (`application/octet-stream`) MIME skipped the gate; GIF bytes that still decoded became JPEG uploads.

**Fix:** Treat empty/generic MIME as unreliable; refuse denylisted extensions (`.gif`, `.bmp`, `.pdf`, …) before decode. Authoritative unsupported MIME still rejected. Valid empty-MIME JPEG/PNG/WebP/HEIC paths preserved.

## REP-CLAIM-001 / E2B-002

**Cause (harness):** Two independent false-fail paths:

1. Assertion used `cats.includes('cocktail')` while `result_json.claimed_categories` is `[{ category: 'cocktail', points, offer_id, … }]`.
2. Review helper clicked the row when `data-state=selected`, which **deselects** the claim before submit → ordinary log with `cats=[]` / `points=0`.

**Product proof (`:55321`):** Submit with cocktail selected → `ACCEPTED`, points > 0, categories include cocktail object. Submit with empty `selected_claims` → `ACCEPTED`, `claimed_categories: []` (correct unclaimed log).

**No product scoring race found.**

## REP-PREVIEW-001 / DEF-QA1-001

**Cause:** Eligibility evaluates featured-bar match before companion/crew reasons. When Cocktail designated bar ≠ today’s Bar Bounty bar, `not_featured_bar` is returned.

**Why keep it:** Showing a companion reason at the wrong bar would imply selecting a crewmate could unlock Bar — which it cannot. Location is the harder, more accurate gate.

**Fix:** Update closeout contract to accept `not_featured_bar`. Do not change backend eligibility order.

## REP-CRW-001 / INT-CRW-001

**Cause:** `admin_list_bar_bounty_crews` calls `bar_bounty_ensure_crews_at`, which generates and locks the day if none exist. `BarBountyCrewsSection` called that RPC on `onMounted`, so merely opening Admin Drink It! locked crews. Copy incorrectly claimed “read-only”.

**Fix:** Idle until explicit Generate/Load; confirm dialog before first call; honest copy. Backend ensure semantics unchanged (idempotent once locked).

## REP-CLK-001 / INT-CLK-001

**Cause:** Backend latches finale when ship time crosses Friday 6 PM with no refusal. Admin UI had a generic confirm dialog without calling out irreversibility.

**Fix:** Detect proposed time ≥ `finale_at_utc` (via `shipLocalToUtcMs`); require checkbox acknowledgement; rename apply CTA. Backend latch math unchanged.

## REP-CAT-ERR-001 / INT-CAT-007

**Cause:** When forged/malformed scalars bypass the TS validator, Postgres raises `invalid input syntax` / `out of range`. Client treated transport RPC errors as `unknown`.

**Fix:** Detect those message patterns and return `failed` / `invalid_payload` with a clear Admin message. Primary protection remains local `previewCatalogImport` readiness gate.

## REP-AUTH-001 / INT-AUTH-001

**Cause:** Supabase access JWTs are bearer tokens valid until `exp`. Client `signOut` clears local session (and can revoke refresh tokens with `scope: 'global'`) but does not invalidate already-issued access tokens server-side without a denylist.

**Disposition:** Deferred with justified impact — not a stuck submit button; shared-device residual until TTL. Documented; use global signOut; do not broaden into speculative auth rewrite.
