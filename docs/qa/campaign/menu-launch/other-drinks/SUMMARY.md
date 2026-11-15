# Other Drinks + Tuesday gameplay preview

**Verdict:** Permanent catalog-independent **Other Drinks** is implemented at every physical bar. Tuesday Day 4 active gameplay is available on disposable `:55321` via a separate Vite preview. Organizer Wrapped fixture on `:54321` was not mutated. Feature changes are **uncommitted** pending organizer visual review. No push / deploy / production migration.

## Priorities completed

1. **Tuesday preview** on disposable `:55321` (separate from organizer Wrapped).
2. **Other Drinks** — 16 code-owned ordinary-log options, last row on physical bars, not on Mobile Order.

## Preview for organizer

See [`TUESDAY_PREVIEW.md`](./TUESDAY_PREVIEW.md).

- **URL:** `http://127.0.0.1:5188`
- **Database:** disposable `star-princess-disposable-mo` / `http://127.0.0.1:55321`
- **Organizer Wrapped:** leave `http://127.0.0.1:5173` alone (still points at `:54321`)

## M2-P1 checkpoint

Local commit `6a43c84` — `:white_check_mark: Checkpoint M2-P1 Category U price policy` — before this feature. Category U tests still pass; Category U logic unchanged.

## Stop point

Organizer should visually review the Tuesday logging flow (bar → Other Drinks → companions). Do **not** begin the menu-agent dress rehearsal yet.
