# QA-ACH-GALLERY-001 — Generic achievement announcement in Drink It! Gallery

**Status:** Root cause identified for earned-secret masking; hardened  
**Severity:** Was presenting earned secrets as generic until finale  
**Surface:** Drink It! Gallery achievement cards

## Observed symptom

An achievement announcement showed only:

> Achievement unlocked

…with a generic award icon instead of the achievement’s title, description, and Font Awesome icon.

## Approved reveal rules

| Case | Expected |
|---|---|
| Ordinary earned | Real title, description, icon |
| Secret **not** earned | Masked on Achievements catalog (`?????` / Secret Achievement); **no** Gallery card |
| Secret **earned** | Real unlocked metadata on Gallery (and catalog) |
| Missing catalog / incomplete evidence | Safe `'Achievement'` fallback — not a false secret identity |
| Revoked award | Gallery row excluded (`aa.status = 'active'` required) |
| Concurrent grants | Atomic evidence on award insert; unique active award per owner |

## Findings

1. **`list_gallery_feed` defect (fixed):** masked `evidence_json.secret` titles whenever finale was not latched, even though Gallery achievement events only exist for **active earned awards**. That incorrectly forced earned secrets to `"Achievement unlocked"`.
2. **Frontend:** null-title fallback previously impersonated masking copy for non-secret incomplete payloads (hardened earlier).
3. **Grant race:** gallery metadata now written on the initial award `INSERT` (`20261105010300`).
4. Live Tuesday sample at investigation time had **no** secret Gallery cards; ordinary cards were already correct.

## Corrections

| Change | Purpose |
|---|---|
| `20261105010500_gallery_earned_secret_reveal.sql` | Reveal earned award metadata on Gallery, including secrets |
| `achievementAnnouncement.ts` + unit tests | Earned-secret titles are not treated as masked |
| `20261105010300_…_atomic.sql` | Close grant evidence race |

## Not changed

- 174 achievement definitions  
- Achievements catalog unearned-secret masking  
- Gallery layout / Visual Fidelity styling  
