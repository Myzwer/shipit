# Production readiness and final-content checklist

These are **intentional later inputs**, not missing engineering decisions. Develop against conspicuously labeled staging fixtures and do not publish them to the live game.

## Final content to supply and verify

- [ ] Actual cruise Day 1 Saturday and Day 7 Friday dates (Ship Clock anchor, Friday 6 PM deadline).
- [ ] Admin configured starting ship offset, planned daily 3 AM changes, and manual correction fallback.
- [ ] Actual player roster and safe per-player passwords, game memberships, assigned Ship It! teams.
- [ ] Seven fixed Bar Bounties (one designated bar/day).
- [ ] Seven finalized Daily Challenges, each with required photo and conditions.
- [ ] All 50 scavenger challenge titles/instructions reviewed against venue realities; rewrite the source's video-optional Victory Dance to photo-only.
- [ ] Verified Drink It! 13-bar catalog, supported named-drink pool, verified <=$15 eligibility; Good Spirits unpriced drinks remain unverified unless checked.
- [ ] Final Cocktail oddity classifications/tier pool and Ingredient rarity classifications/bar-first pool; no repeats across the cruise.
- [ ] Actual achievements and any Wrapped awards/stat definitions from the separate achievement-design session.
- [ ] Final readable ingredient aliases checked against source, including seasonal ingredients.
- [ ] Font Awesome Pro npm package token configured via environment secret and available in deployment; no token committed.

## Build/test gates

- [ ] Multiple registered player accounts and multiple team memberships tested.
- [ ] Per-category daily limits, companion requirements, exact designated Cocktail bar, hidden grace, and Friday 6 PM cutoff validated server-side.
- [ ] Simultaneous Ship It! challenge submissions and exclusive First races resolve consistently.
- [ ] Duplicate/uncertain Wi-Fi retries never double-award scores or Gallery posts.
- [ ] Gallery pagination, download, notifications and achievement popups verified on phones.
- [ ] Ship Clock backward and forward changes, schedule changes, and no retrospective replays verified.
- [ ] Admin skip both bounty types with reserves, paused Saturday menu rebuild, JSON preview/publish and guarded catalog rollback exercised.
- [ ] Full 40% menu-drift rehearsal completed in staging, with preserved historical scores.
- [ ] Required photos for Ship It! and Daily, optional photos for ordinary Drink It!, successful compression/download.
- [ ] One-time Wrapped reveal, ties, secret disclosures, and immutable post-finale scores verified.
- [ ] Development data reset via developer-only command; production setup verified with no synthetic users or sample scores.

## Saturday menu audit (organizer-side, not in-app AI)

1. Send family scouts to bars to photograph cocktail menus, specials and holiday menus.
2. If menus largely match, proceed with existing catalog plus narrow corrections.
3. If menus differ significantly, pause **Drink It! only** in Admin. Ship It! continues.
4. Export the current catalog/game-state evidence and give it to the future dedicated Menu Reconstruction Agent with changed-menu photos.
5. Receive two distinct deliverables: complete validated JSON + readable evidence/differences/uncertainty report. Unphotographed bars retain previous information and are explicitly unverified.
6. Admin import → preview → publish, preserving logged history, and manually Resume Drink It! at the appropriate Ship Time.

**Separate pre-sailing task:** Prepare and rehearse the dedicated Menu Reconstruction Agent protocol against the final implementation's JSON Schema; this package does not purport to provide that final agent or production-ready JSON today.
