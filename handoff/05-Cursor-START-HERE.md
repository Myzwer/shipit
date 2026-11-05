# Cursor: Star Princess — read-only first-pass instructions

You are receiving a fully planned small private cruise game: **Drink It!** (individual bar/cocktail/ingredient bounties) and **Ship It!** (team photo scavenger hunt). The organizer is delegating implementation to you but wants a human-supervised phase-by-phase workflow. **YOUR FIRST RESPONSE MUST BE READ-ONLY.**

## 0. Do not execute anything yet

Before explicit approval, **do not write files, install packages, initialize the repository, run database migrations, create Supabase projects, modify Vercel settings, generate code, or start a phase.** Reading the provided materials is the entire first task. Do not treat this instruction as permission for autonomous implementation.

## 1. Read in this order

1. `README.md` — file manifest, important caveats, scope and authority.
2. `01-Game-Rules.md` — *what scores and why*.
3. `02-UX-Behavior.md` — *what people see and do*, including Section 16 for Saturday menu audit and Pause/Resume.
4. `03-Technical-Spec.md` — selected Vue/Tailwind/Supabase/Vercel architecture, consistency and implementation phases.
5. `04-UI-Content-and-Icons.md` — specific UI strings, direct error messages, Font Awesome Pro icon registry.
6. `design/README.md` and the actual reference images — appearance; newer 3 screenshots override older affected views.
7. `data/menus/README.md`, `data/rankings/README.md`, and `data/challenges/Ship-It-50-Challenges-Source-REVIEW.md` — reference data only, **not final production fixtures**.
8. `docs/Production-Content-and-Launch-Checklist.md` — data/ops work intentionally deferred to launch.

## 2. Respond with a comprehension report, NOT code

Use these exact headings:

1. **Understanding of the two games** — one paragraph each; scoring, social and finale distinctions.
2. **Proposed architecture** — summarize the *chosen* stack, backend authoritative boundaries, auth, storage, DB transactions, security and deployment.
3. **Critical correctness invariants** — enumerate the big failure modes (clock, two claims, first-to races, photo retries, menu swaps, admin pause, finale).
4. **Visual and copy authority** — how you will reuse the mockups and the UI content/icon map, plus the acknowledged refreshed-ZIP caveat.
5. **Genuine contradictions/blockers only** — cite exact document/section; do not reopen settled product choices. Distinguish missing production content from engineering blockers.
6. **Proposed implementation phases** — map to Technical Spec Section 16, with specific acceptance tests for Phase 0 and Phase 1.
7. **What you would do first once approved** — one contained, reviewable task, and what you would show the organizer at the checkpoint.

Stop after delivering that report. The organizer will paste your reply into a separate supervising Development Director conversation. **Do not continue or execute until an explicit next instruction arrives.**

## 3. Nonnegotiable boundaries

- One Vue 3 + TypeScript + Vite + Tailwind SPA with Vue Router/Pinia, two themed game modules, Supabase PostgreSQL/Auth/private Storage, targeted functions, and Vercel. No WordPress or independent React replacement.
- Supabase/server Postgres owns clock, scoring, daily limits, exclusive awards, idempotency and authorization, never the mobile phone.
- Photos required for Ship It! and Daily Challenges; optional for ordinary Drink It!. No video.
- Account names selected from a dropdown; actual auth remains managed. No public signup.
- All eligible bounties preselected at Review; warnings only for intentionally unchecked eligible claims.
- Game-specific Galleries and reactions ❤️ 😂 🤙; no cross-game feed or individual bounty-claim spoilers.
- Admin ship clock/overnight plan, skips, small corrections, pause/resume Drink It!, and full catalog JSON import/preview/publish. Import does not deploy code or reaward historical submissions.
- No final content fabricated. No secrets or Font Awesome tokens committed.
- Finale Friday Day 7 at 6 PM Ship Time is a hard stop, with no post-finale admin voids.
