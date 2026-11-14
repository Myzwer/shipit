# Mobile Admin file handoff

## Intended path

1. Download importer JSON (Plan A photo catalog or Plan B February fixture) into iPhone **Files**
2. Safari (or installed PWA) → sign in as Admin → **Admin → Catalog**
3. File input `accept="application/json,.json"` (`data-testid="catalog-import-file"`)
4. Browser reads via `file.text()` → local `previewCatalogImport`
5. Stage → server preview → Publish (requires `safe_to_publish`)
6. Separately: Initialize Bounty Schedule

Paste textarea is a fallback if file picking fails.

## Source-defined restrictions

| Constraint | Observation |
|---|---|
| MIME/extension | `application/json,.json` only |
| Explicit max upload bytes | **None** in `CatalogImportSection.vue` |
| Practical limit | Device memory / Safari; February file ≈ 286 KB (comfortable) |
| Export button | **Not** an import file (`export_schema_version`) |

## Simulated mobile evidence (M1)

| Check | Result | Class |
|---|---|---|
| 390×844 viewport Admin Catalog file input | PASS | Browser automation (Playwright iPhone UA) |
| Invalid JSON feedback | PASS | Browser automation |
| Valid JSON → local preview | PASS | Browser automation |
| Offline stage does not crash section | PASS | Browser automation |
| Physical iPhone Files → Safari | **Not proven** | Awaiting device |

Screenshot: `evidence/browser-admin-catalog-mobile.png`.

## Failed-network handling

Pending stage/publish writes a local pending lock (`pendingAdminCatalogImport`). On unknown outcomes use **Check status** / **Discard pending**. Discard does **not** change the active catalog.

## Pre-cruise organizer checklist

- [ ] Copy February fallback JSON into Files (and a second location)
- [ ] Optionally copy a validated Plan A JSON when ready
- [ ] Confirm Admin login works on ship Wi‑Fi / offline package
- [ ] Practice once on disposable/staging before sailing
- [ ] Remember: unique `catalog_id` required for each successful publish
