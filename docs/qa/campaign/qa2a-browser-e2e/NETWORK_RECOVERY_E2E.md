# QA-2A — Network & submission recovery

**Fault injection:** Playwright `page.route` abort/delay + `context.setOffline`  
**Distinguish:** recoverable UX vs harmless idempotent server replay (QA-1)

## Results

| ID | Journey | Outcome |
|---|---|---|
| E2E-NET-001 | Home under ~1.2s API latency | **passed** |
| E2E-NET-002 | Abort RPC before drink submit | **passed** (stays on log / error path) |
| E2E-NET-003 | Refresh during slow Ship It submit | **passed** (page recovers; no endless blank) |
| E2E-NET-004 | Offline navigation | **passed** |
| E2E-NET-005 | Repeated login taps | **passed** |
| E2E-NET-006 | Two tabs same log wizard | **passed** |
| E2E-NET-007 | Auth cleared mid drink submit | **passed** |
| E2E-NET-008 | Storage OK / DB fail split | **blocked** |
| E2E-NET-009 | Loss after server accept | **blocked** (backend idempotency in QA-1) |

## Interpretation

- Failed requests did **not** produce a stuck infinite spinner in exercised paths.
- Retry safety: Drink log / Ship It rely on server idempotency keys (QA-1). UI does not always make “safe to tap again” obvious after unclear responses — residual guest risk on flaky ship Wi-Fi.
- REL-001 double-submit remains a client race even when scores stay correct.
