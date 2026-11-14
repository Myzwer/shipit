# QA-2B — Long-running browser sessions

## What was automated

| ID | Journey | Outcome |
|---|---|---|
| E2B-L01 | Controlled cocktail hour nudge | **blocked** — `dev_set_ship_clock_offset_minutes` RPC not present on disposable |
| E2B-L02 | Home phase attribute while open | **passed** |
| E2B-L03 | Simulated signed URL failure | **failed** — `errorFired=true`, `hasOnErrorAttr=false` → REL-008 / E2E-030 |
| E2B-L04 | Offline gap then reload | **passed** |
| E2B-L05–L08 | Real multi-hour rotation / grace / Friday / finale | **blocked** — short stress window |

## Technique limitations (honesty)

- **E2B-L03** injects a dead `img.src`. This is **not** a real ~1 hour signed URL expiry soak. It only proves missing client recovery hooks.
- **E2B-L01** could not advance authoritative ship clock via missing RPC. Use disposable `db:seed-bounty-now --hour=…` from the disposable worktree for controlled rollover (never organizer).
- Pause/resume and finale browser presentation were covered in QA-2A lifecycle (`E2E-LC-005/006/009/010`) and were **not re-mutated** here to avoid contaminating flake fixtures mid-investigation.

## Manual / device follow-ups

See `MANUAL_DEVICE_ACCEPTANCE.md` for DEV-ROT-01, DEV-GRACE-01, DEV-GAL-01, Friday cutoff, and Wrapped transition while a tab stays open.
