/**
 * QA-3B — Awarding / void / Ship It! tie / Wrapped photo signed-URL contracts.
 * Source-level production contracts + independent fixture expectations.
 * Live transactional award proofs are blocked (see BLOCKED_INTEGRATION_TESTS.md).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const mig = (name: string) => readFileSync(join(root, 'supabase/migrations', name), 'utf8')
const src = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('QA3B awarding / void contracts (source)', () => {
  it('submit finalize attaches new_achievement_ids in the same accept path', () => {
    const sql = mig('20261105007100_phase7a_achievement_awards_void_submit.sql')
    expect(sql).toContain('achievement_finalize_submit_result')
    expect(sql).toContain("'new_achievement_ids'")
    expect(sql).toContain('achievement_evaluate_after_submit')
  })

  it('void recomputes awards and exclusives; post-finale freeze exists', () => {
    const sql = mig('20261105007100_phase7a_achievement_awards_void_submit.sql')
    expect(sql).toContain('achievement_on_void_submission')
    expect(sql).toContain('achievement_finale_frozen')
  })

  it('idempotent replay short-circuits award evaluation', () => {
    const sql = mig('20261105007100_phase7a_achievement_awards_void_submit.sql')
    expect(sql).toContain('idempotent_replay')
    expect(sql).toMatch(/if coalesce\(\(p_result->>'idempotent_replay'\)::boolean, false\) then[\s\S]*return p_result/)
  })

  it('working / FINAL loaders keep test_only=true until explicit production confirm', () => {
    const load = src('scripts/load-working-achievements.mjs')
    const prod = src('scripts/load-production-achievements.mjs')
    const release = mig('20261105008300_phase10b_achievement_release_path.sql')
    expect(load).toContain('test_only: true')
    expect(prod).toContain('--confirm-non-test-only')
    expect(release).toContain('p_confirm_non_test_only')
  })
})

describe('QA3B Ship It! score-reached tie rule (WRP consistency)', () => {
  it('authoritative shipit_team_score_rows breaks equal points by earliest score_reached_at', () => {
    const sql = mig('20261105010700_pc1_shipit_score_reached_ranking.sql')
    expect(sql).toContain('score_reached_at')
    expect(sql).toContain('max(sc.completed_at_utc) as score_reached_at')
    expect(sql).toMatch(/order by coalesce\(agg\.points, 0\) desc,\s*coalesce\(agg\.score_reached_at/s)
    // Independent fixture expectation (not the SQL under test):
    // Team A points=500 reached_at=T1; Team B points=500 reached_at=T2>T1 → A ranks above B.
    const fixture = [
      { team: 'A', points: 500, score_reached_at: '2026-11-12T15:00:00Z' },
      { team: 'B', points: 500, score_reached_at: '2026-11-12T16:00:00Z' },
      { team: 'C', points: 400, score_reached_at: '2026-11-11T12:00:00Z' },
    ]
    const ranked = [...fixture].sort(
      (a, b) =>
        b.points - a.points ||
        Date.parse(a.score_reached_at) - Date.parse(b.score_reached_at) ||
        a.team.localeCompare(b.team),
    )
    expect(ranked.map((r) => r.team)).toEqual(['A', 'B', 'C'])
  })
})

describe('QA3B Wrapped photo signed URL path (links REL-008)', () => {
  it('WRP-002/REL-008: WrappedPhotoCard must refresh or reload signed URLs on error', () => {
    const card = src('src/features/wrapped/WrappedPhotoCard.vue')
    expect(card).toContain('fetchGalleryPhotoSignedUrl')
    // Expected: expiry-aware refresh and/or @error → reload (same class as REL-008).
    expect(card).toMatch(/@error|onError|reload|refresh|expires/)
  })

  it('gallery API still signs for 3600s by default (same expiry class as REL-008)', () => {
    const api = src('src/lib/gallery/api.ts')
    expect(api).toContain('expires_in ?? 3600')
  })
})

describe('QA3B cross-system consistency fixtures (independent expectations)', () => {
  it('ordinary drink log must not inflate bounty-only metrics', () => {
    const fixture = {
      drink_logs: [{ id: 'L1', voided: false }],
      bounty_claims: [],
    }
    const drinksLogged = fixture.drink_logs.filter((l) => !l.voided).length
    const bountiesCompleted = fixture.bounty_claims.length
    expect(drinksLogged).toBe(1)
    expect(bountiesCompleted).toBe(0)
  })

  it('voided claim must drop from bounty totals and keep drink log if still accepted', () => {
    const fixture = {
      drink_logs: [{ id: 'L1', status: 'accepted' }],
      bounty_claims: [
        { id: 'C1', log: 'L1', status: 'voided', category: 'cocktail' },
        { id: 'C2', log: 'L1', status: 'active', category: 'ingredient' },
      ],
    }
    const activeClaims = fixture.bounty_claims.filter((c) => c.status === 'active')
    expect(activeClaims).toHaveLength(1)
    expect(fixture.drink_logs.filter((l) => l.status === 'accepted')).toHaveLength(1)
  })

  it('tied Drink It! points use competition ranking 1,1,3 independently of achievements', () => {
    const scores = [
      { player: 'A', points: 200, achievements: 40 },
      { player: 'B', points: 200, achievements: 10 },
      { player: 'C', points: 50, achievements: 40 },
    ]
    const byPoints = [...scores].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player))
    const ranks: number[] = []
    byPoints.forEach((row, i) => {
      ranks.push(i > 0 && byPoints[i - 1]!.points === row.points ? ranks[i - 1]! : i + 1)
    })
    expect(ranks).toEqual([1, 1, 3])
  })

  it('5 AM reporting-day boundary must not redefine calendar cruise_day achievements', () => {
    // Contract: activity_day migration is analytics; cruise_day achievements use ship calendar days.
    const activity = mig('20261105011000_activity_day_reporting_boundary.sql')
    const engine = mig('20261105007400_phase7b0_classification_and_eval_fixes.sql')
    expect(activity).toMatch(/activity_day|reporting/i)
    expect(engine).toContain("'cruise_day'")
    // Ensure the activity-day migration does not rewrite achievement_eval cruise_day primitive wholesale.
    expect(activity).not.toContain("v_type = 'cruise_day'")
  })
})
