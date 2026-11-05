# Star Princess — Final Cursor Handoff (Consolidated v1.1)

**Product:** Drink It! (individual bar/cocktail/ingredient bounty game) + Ship It! (team photo scavenger hunt), running as one private seven-day family mobile web application.

**First task:** Open **`05-Cursor-START-HERE.md`** and follow its **read-only** initial report request. Do not build until the organizer reviews the report with the supervising development chat.

## Document authority

| File | Governs |
|---|---|
| `01-Game-Rules.md` | Game eligibility, scoring, times, ownership and finale. |
| `02-UX-Behavior.md` | Navigation, submissions, notifications, error behavior, Admin Pause/Resume and Saturday menu audit. |
| `03-Technical-Spec.md` | Stack, authentication, schema/invariants, imports, operations, tests and build phases. |
| `04-UI-Content-and-Icons.md` | Exact initial interface wording, clear errors, Font Awesome Pro icon registry and accessibility labels. |
| `design/` | Visual appearance, not permission to invent new behavior or treat example content as real. |
| `data/` | Original drink/challenge references and **draft** rankings, not blindly deployable final data. |
| `docs/Production-Content-and-Launch-Checklist.md` | Deferred player/content/launch tasks and Saturday photo-audit operating procedure. |

If there is a genuine contradiction, identify the exact conflict and ask only about that blocking feature. Do not silently select an older instruction, and don't reopen rules that the organizer already decided. **Default: gameplay rules > UX behavior > UI copy for behavior; design images control appearance; technical spec controls implementation.**

## Critical distinctions to preserve

- Drink It! is individual; Ship It! is team-based; their Galleries and awards are separate.
- Drink It! Cocktail Bounty is at **one designated bar**. The Ingredient Bounty is a hidden-location hunt. Players can confirm missing active ingredients only for their named drink at the selected bar; the catalog is enriched for future selections without re-ranking existing history.
- All eligible bounty claims are selected by default. Successful submissions are final; failed/uncertain saves are safely retryable, not duplicate-scoring.
- Drink It! can be paused globally for its own players for Saturday menu verification; **Ship It! stays active**. A separate agent—not the runtime app—reconstructs the catalog from photographed menus.
- Awards Mode begins at Friday 6 PM **Ship Time**. No new logs or admin score correction after.
- The copy spec is an accepted starting version; user may tweak nonfunctional strings during QA. Errors should be unambiguous, not jokey.

## Important asset note: re-rendered mockups

The organizer mentioned a freshly re-rendered full mockup set but **did not upload that replacement ZIP before this handoff was generated**. Accordingly, `design/original-final-mockups/` contains the 15 original JPGs, `design/latest-available-updates/` contains the 3 later approved screenshots, and `design/additional-screen-reference/` includes the separately shared Ship It! challenge-list mockup. **Do not claim that the latest re-rendered full set is present.** When provided, the new exports replace their matching older files; check `design/README.md`.

## Data sources and caveats

- The beverage reference covers 13 bars using older menu snapshots. Good Spirits cocktails lack confirmed $15 pricing; do not assume eligibility. The display-alias file adds parenthetical explanations **only**, not new qualifying ingredient facts.
- Cocktail oddity and Ingredient rarity rankings are **review drafts**. They inform how to represent game data, but are not final verified Saturday game pools.
- The source DOCX contains 50 Ship It! challenges but one offers video; production gameplay supports **photos only**. That description needs final wording before content lock.
- Final real players, team assignments, Daily Challenges, seven Bar Bounties, achievements, cruise dates and adjusted Ship Clock plan are configuration/content tasks before launch. They are not reasons for Cursor to invent content.
- The Menu Reconstruction Agent prompt/contract is a separate pre-sailing deliverable against the implemented JSON Schema. The game importer must be capable of accepting its future complete datasets without code redeployment.

## Confidentiality

Do not include Supabase service-role keys, Font Awesome Pro package tokens, real player passwords, or Vercel secrets in this ZIP, in Git, or in generated chat output. Configure environment variables and secret-manager settings only when deployment is authorized.

## Package inventory

See `MANIFEST.sha256` for byte-level file integrity, and `docs/Production-Content-and-Launch-Checklist.md` for the release gate. All earlier question audits, v0.9 working drafts, and superseded addenda are intentionally omitted to prevent authority confusion.
