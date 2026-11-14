# R3 — Remaining Risks

| Risk | Severity | Notes |
|---|---|---|
| No automated **≥1 hour** Gallery soak in CI | P2 | Real proof used 60s TTL floor. Manual / post-fix soak (`DEV-GAL-01` / E2E-ME-013) still valuable on ship Wi-Fi. |
| PhotoViewer proactive refresh is a **51-minute heuristic** from open | P3 | Parent usually opens with a fresh thumb URL; exact remaining TTL is not plumbed into the viewer. `@error` + online/visibility still recover. |
| `storage-js` / CDN may return opaque image errors | P3 | Treated as `@error` → renew; permanent RPC denials still stop loops. |
| Extremely flaky ship Wi-Fi could burn the transient retry budget | P3 | Online + visibility reset budgets; user navigation remounts cards. |
| Wrapped finale browser Polaroid not re-run end-to-end this assignment | P3 | Same `useSignedPhotoUrl` as Gallery; WRP-002 contract green. Prefer a short Wrapped smoke after merge. |
| Empty-MIME GIF `processImage` failure | — | **Unrelated** known red (not R3). |
| Migration `11100` ranking | — | **R6** — deliberately untouched. |

## Operational constraints preserved

- Agent 2 mutates only `:56321`
- Organizer `:54321` and Agent 1 `:55321` not reconfigured/stopped
- No push / deploy / merge from this branch
- Private signed URLs excluded from committed evidence
