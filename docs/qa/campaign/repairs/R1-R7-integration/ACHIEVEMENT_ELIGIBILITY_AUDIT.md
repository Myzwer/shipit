# R1–R7 Integration — Achievement Eligibility Audit

## 174 vs 164 + 10

| Layer | Count | Meaning |
|---|---:|---|
| FINAL authority (`finalAuthority.json`) | **174** | Approved product definitions (126 Drink It! + 48 Ship It!) |
| Composed active definitions | **174** | All FINAL rows implemented |
| Production release map rows | **174** | Every FINAL `stableKey` mapped exactly once |
| `enabledInProductionRelease: true` | **164** | May be loaded for production release when explicitly confirmed |
| Blocked from production release | **10** | Intentionally not release-enabled |

**Mapped ≠ earnable ≠ release-enabled.**  
The FINAL specification contains **174 definitions**. It does **not** require all 174 to be production-release-enabled before companion UUID maps / organizer decisions exist. R7 correctly maps all 174 and gates 10.

Map id: `working-achievements-production-release-v2-final-174`  
Summary: `blocked_organizer: 2`, `blocked_metadata: 8`.

## The exact ten blocked definitions

### Organizer decision blockers (2) — `blocked_organizer`

| ID | stableKey | Name | Why blocked | Intentional? | FINAL wants it earnable? | Catalog evidence? | Temporary/permanent | Eligible with menu data alone? |
|---|---|---|---|---|---|---|---|---|
| D-082 | `working-drinkit-d082` | Wrinkles only go where the smiles have been | Production map: inactive until organizer decision (D-082/085). Condition: `companion_predicate` / `all_other_enrolled_companions` (cruise-wide social completeness). | **Yes** — ops gate, not a map bug | Yes as a FINAL definition; release enablement deferred | N/A (companion/enrollment rule) | **Temporary** until organizer confirms enablement | No — needs roster/enrollment policy, not menu tags |
| D-085 | `working-drinkit-d085` | Take it to the limit | Same organizer gate. Condition: `day_bounty_score` ≥275 with all four bounty categories same day. | **Yes** — difficulty/ops gate | Yes as FINAL definition; release deferred | N/A (bounty scoring rule) | **Temporary** until organizer confirms | Partially — engine can evaluate once enabled; no missing catalog tag |

Working catalog marks both `readiness: "enabled"` for **dev** (`testOnly: true`). Production release map is the cruise enablement gate.

### Companion metadata blockers (8) — `blocked_metadata`

All require an out-of-band private companion UUID map (aliases → player UUIDs). No dual-award. **Permanent until map is provisioned** for the cruise; then they become earnable without inventing menu data.

| ID | stableKey | Name | Companion alias / gist |
|---|---|---|---|
| D-086 | `working-drinkit-d086` | One Peppy Lopez, Please. | `companion-david-b` + tequila cocktail |
| D-087 | `working-drinkit-d087` | Something something alcohol tolerance | `companion-josh` + alcoholic, no bounty claim |
| D-088 | `working-drinkit-d088` | A Pirate Looks at 40 | `companion-david-f` + Beer option |
| D-089 | `working-drinkit-d089` | At Least it isn't coors lite | `companion-cindy` + Aperol |
| D-090 | `working-drinkit-d090` | Feeding the Fishes | `companion-jordan` + rum cocktail |
| D-091 | `working-drinkit-d091` | This is too sweet for me | `companion-dan` + bourbon cocktail |
| D-092 | `working-drinkit-d092` | The Wino and I know | `companion-katie` + Wine option |
| D-093 | `working-drinkit-d093` | Dear Maria, Count me Gin | `companion-jonathan` + gin cocktail |

These are **not** blocked by missing catalog evidence. Ingredient/mode constraints are ordinary once the UUID map exists.

## Not in the “10 blocked” set (but limited earnability)

### Frozen tropical collections (release-enabled, verification-gated)

| Achievement | Release map | Earnable now? | Reason |
|---|---|---|---|
| D-033 Stuck in Colder Weather (`tag_match` frozen) | enabled | **Yes after launch-candidate republish** with `frozen` tag | Launch JSON has `frozen` on `frozen-aperol-spritz` only |
| Frozen Concoctions (3 frozen **tropical**) | enabled | **No** | `verification_required`; eligible tropical+frozen set empty (Frozen Aperol Spritz is frozen, **not** tropical) |
| License to Chill (all frozen tropical) | enabled | **No** | Same gate |

R7 did **not** invent tropical-frozen drinks. Unit ACH-001 now passes because a concrete `frozen` tag exists; tropical collections remain organizer-gated.

### Good Spirits gauntlets

Still `verification_required` with zero launch eligible price-verified offerings — intentional.

## Unintentional blocks?

**None among the ten map-blocked rows.** They match documented organizer/companion gates.  
Remaining “cannot earn on active DB catalog” failures from R7 QA-4A (`ACH-001-ACTIVE-CATALOG`, `ACH-003-ENGINE-REACHABILITY`) are **active catalog pointer / fixture content** issues (schedule fixture without tags), not release-map defects. Launch JSON repairs address content; **republish** is still required.

## Organizer / catalog decisions still required

1. Confirm enablement of D-082 / D-085 for production release (or keep blocked).
2. Provision private companion UUID map for D-086–D-093 (gitignored; never commit private roster).
3. Confirm which launch-candidate drinks are **frozen and tropical** (or confirm none for launch) before ungating License to Chill / Frozen Concoctions.
4. Republish **star-princess-launch-candidate-v1** (post-R7 tags: `frozen`, `spirit-dark`, ingredient aliases) as the active cruise catalog after schedule work.
5. Good Spirits price verification before those gauntlets can complete.
