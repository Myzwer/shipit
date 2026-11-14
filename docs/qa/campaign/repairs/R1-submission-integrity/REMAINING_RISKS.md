# R1 — Remaining Risks

## Accepted residual

1. **Hard reload after accept, before `clearPending`**  
   Pending LS can remain even though the server already accepted. Re-opening the log restores recovery UI; Retry replays the **same** key (`idempotent_replay`). No second score. UX is slightly confusing until Retry/abandon — acceptable for ship Wi-Fi; optional future: reconcile pending against `submissions` by key on restore.

2. **Module-level latch is per JS context**  
   A second browser tab has its own latch. Concurrent tabs with the **same** key are safe (integration-proven). Concurrent tabs that somehow mint **different** keys for one human intent remain a theoretical multi-device risk; honor-system ordinary logging still allows genuine separate logs.

3. **Daily / Scavenger lack drink-style module coalesce**  
   They now latch `submitting` synchronously before awaits and reuse durable pending keys. They do not share the drink store’s module promise coalesce. Server idempotency + one-completion rules still protect scores. A follow-up could extract a shared `createSubmitLatch()` helper if stress shows gaps.

4. **Full QA-2B stress suite not re-run end-to-end**  
   Focused S07 + remint race + integration covered the defect. A full `--suite=stress` pass is still recommended before cruise freeze (fixture exhaustion / login flakes may still fail unrelated cases).

5. **R2 media overlap**  
   Photo abandon on discard/reset remains broken (REL-003/004). R1 intentionally did not touch abandon wiring. Serialize R2 after this commit on the same surfaces.

## Not remaining for REP-SUB-001

- Same-key duplicate accepts on drink submit after mid-flight reset (fixed).
- Scavenger/Daily missing in-function in-flight early return (fixed).
- Need for extra confirmation / companion approval (not introduced).

## Organizer / Agent 2 safety

- No mutations to `:54321` or `:56321`.
- No `QA_ALLOW_ORGANIZER_MUTATION`.
- No push/deploy.
