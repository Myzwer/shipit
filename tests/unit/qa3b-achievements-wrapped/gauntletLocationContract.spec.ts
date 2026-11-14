/**
 * QA-3B — Bar Gauntlet / collection location contract (ACH-002).
 *
 * Spec (STAR_PRINCESS_ACHIEVEMENTS_FINAL_STANDALONE §3.4): personal gauntlet
 * progress requires logs recorded at that bar. Mobile Order must not qualify.
 *
 * Production SQL `achievement_log_counts_for_collection` / covered_count match
 * by offering_id only — no drink_logs.bar_id = bar_offerings.bar_id check and
 * no is_virtual exclusion on the logged bar.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function readMigration(name: string) {
  return readFileSync(join(root, 'supabase/migrations', name), 'utf8')
}

describe('QA3B gauntlet location / Mobile Order contract (ACH-002)', () => {
  it('ACH-002: collection coverage must require log bar_id match and exclude virtual bars', () => {
    const a1 = readMigration('20261105008600_phase_a1_same_log_collections.sql')
    const a5 = readMigration('20261105009200_phase_a5_achievement_read_perf.sql')

    const logCountsFn = a1.slice(
      a1.indexOf('create or replace function public.achievement_log_counts_for_collection'),
      a1.indexOf('$$;', a1.indexOf('create or replace function public.achievement_log_counts_for_collection')) +
        3,
    )
    // Expected (FINAL §3.4 + Mobile Order exclusion): location-bound coverage.
    // Observed: offering_id-only match; no bar_id equality; no is_virtual filter.
    expect(logCountsFn).toMatch(/d\.bar_id\s*=\s*bo\.bar_id/)
    expect(logCountsFn).toMatch(/is_virtual/)

    const coveredCount = a5.slice(
      a5.indexOf('create or replace function public.achievement_collection_covered_count'),
      a5.indexOf(
        '$$;',
        a5.indexOf('create or replace function public.achievement_collection_covered_count'),
      ) + 3,
    )
    expect(coveredCount).toMatch(/d\.bar_id\s*=\s*bo\.bar_id/)
    expect(coveredCount).toMatch(/is_virtual/)
  })

  it('mobile-order eval patch excludes virtual bars for distinct/grouped bar subjects but not offering_collection', () => {
    const mo = readMigration('20261105010900_mobile_order_virtual_source.sql')
    expect(mo).toContain("b.is_virtual is false")
    expect(mo).toContain("subject' = 'bars'")
    // offering_collection still delegates to pre_mobile_order path / collection helpers
    const evalSlice = mo.slice(
      mo.indexOf('create or replace function public.achievement_eval_condition_as_of('),
      mo.indexOf(
        "comment on function public.achievement_eval_condition_as_of",
      ),
    )
    expect(evalSlice).not.toContain("v_type = 'offering_collection'")
    expect(evalSlice).toContain('achievement_eval_condition_as_of_pre_mobile_order')
  })

  it('empty full_menu / threshold universes do not auto-complete (guards phantom unlocks)', () => {
    const final = readMigration('20261105009900_phase_final_achievements_catalog.sql')
    expect(final).toContain("or (v_target = 0)")
    expect(final).toContain("'verification_pending'")
    // live_met_config returns false when target < 1 (a1):
    const a1 = readMigration('20261105008600_phase_a1_same_log_collections.sql')
    expect(a1).toContain('achievement_collection_live_met_config')
    expect(a1).toMatch(
      /coalesce\(\(v_resolved->>'target'\)::int, 0\) < 1 then[\s\S]{0,40}return false/,
    )
  })
})
