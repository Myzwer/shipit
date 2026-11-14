# QA-2B — Media stress & upload boundaries

## Implemented limits (source)

From `src/lib/media/constants.ts` (`E2B-M00` **passed**):

| Limit | Value |
|---|---|
| maxLongEdgePx | 2000 |
| maxInputBytes | 25 MiB |
| maxOptimizedBytes | 4 MiB |
| storageMaxBytes | 5 MiB |
| Accepted input | jpeg, png, webp, heic, heif |
| Output | jpeg |

## Results

| ID | Journey | Outcome | Notes |
|---|---|---|---|
| E2B-M01–M05 | JPEG/PNG/portrait/landscape/weird name stage | **failed** | Ship challenge list not available for Demo Both (fixture exhaustion) |
| E2B-M06 | Corrupt file | **passed** | Not staged ready |
| E2B-M07 | >25MB input | **passed** | Not staged ready |
| E2B-M08 | Discard orphan (REL-003) | **blocked** | Could not stage (no open challenge) |
| E2B-M09 | Nav away during stage | **failed** | No open challenge to start |
| E2B-M10 | Abort Storage PUT | **passed** | Route abort → not falsely ready; links REL-005 |
| E2B-M11 | Gallery refresh short session | **passed** | Images present after refresh |
| E2B-M12 | HEIC | **blocked** | Chromium ≠ iPhone — manual device |

## Connection injection points

| Point | Technique | Result |
|---|---|---|
| During Storage upload | `route.abort` on storage object | E2B-M10 — not marked ready |
| Before upload | Corrupt / oversized local reject | E2B-M06/M07 |
| After Storage / before DB bind | Not cleanly split in Playwright without custom proxy | Still gap (NET-008 class) |
| After DB accept / before client confirm | Same infrastructure gap | Still blocked |

## REL defect verification

| REL / E2E | QA-2B |
|---|---|
| REL-003 / E2E-031 discard orphan | Attempted; blocked this run by challenge exhaustion — **retained** |
| REL-005 AbortSignal storage | Synthetic abort covered (`E2B-M10`) |
| REL-008 / E2E-030 signed URL | Short refresh OK; simulated img error has **no** `@error` recovery (`E2B-L03`) |
| REL-001 / E2E-032 double submit | Related stress via S03/S07 |

## HEIC / iOS

Desktop Chromium compatibility ≠ physical iPhone verification. See `MANUAL_DEVICE_ACCEPTANCE.md`.
