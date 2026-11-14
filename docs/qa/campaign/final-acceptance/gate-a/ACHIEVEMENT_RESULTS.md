# Gate A — Achievement Results

## Release map audit (content)

Artifact: `content/achievements/productionReleaseMapping.json`  
Mapping id: `working-achievements-production-release-v2-final-174`

| Metric | Count |
|---|---:|
| Mapped definitions | **174** |
| `enabledInProductionRelease: true` | **164** |
| Blocked (`enabledInProductionRelease: false`) | **10** |

### Operationally blocked (10)

| Snapshot | Readiness | Reason (from map) |
|---|---|---|
| D-082, D-085 | `blocked_organizer` | Inactive until organizer decision |
| D-086–D-093 | `blocked_metadata` | Requires private companion UUID map; no dual-award |

Additional **enabled but verification-gated** notes exist on frozen/tropical and Good Spirits rows (still `enabledInProductionRelease: true` with notes) — not counted in the 10 blocked.

## Disposable DB

| Metric | Value |
|---|---|
| Definitions rows | 179 (includes extras / test history) |
| `test_only=true`, `enabled=true` | 176 |
| Release-enabled production load (`test_only=false`) | **0** on disposable (dev load pattern) |
| Awards total / active | 326 / 34 (prior disposable history; not Gate A earn matrix) |

## Gate A earn proof

| Claim | Status |
|---|---|
| All 174 directly earned in Gate A | **No — not claimed** |
| Distinct awarding rule families exercised | Partial via prior R7/QA-3B + incidental awards from voyage submits |
| Condition types present in DB | 19 families (exact_match, offering_collection, event_count, …) |
| Secret reveal / gallery / void / gauntlet MO exclusion | Prior campaign evidence; not full re-matrix in Gate A |

## Enablement requirement

Map coverage ≠ cruise DB load. Production still needs explicit `load-production-achievements` with confirm gates (`test_only=false`).
