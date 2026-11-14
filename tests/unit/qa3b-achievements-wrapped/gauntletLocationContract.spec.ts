/**
 * QA-3B / R7 — Bar Gauntlet / collection location contract (ACH-002).
 *
 * Spec (STAR_PRINCESS_ACHIEVEMENTS_FINAL_STANDALONE §3.4): personal gauntlet
 * progress requires logs recorded at that bar. Mobile Order must not qualify.
 *
 * Authoritative production SQL:
 * - `achievement_log_counts_for_collection` hardened in `11000` (bar_id + !virtual)
 * - `achievement_collection_covered_count` aligned in `11400` (same guards)
 * Award path uses covered_ids → log_counts; live progress uses covered_count.
 *
 * QA-4A INT-ACH-09: MO leak was NOT reproduced against qa2 with 11000 applied.
 * Wrong-bar physical same-offering submit is rejected (OFFERING_NOT_AT_BAR).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function readMigration(name: string) {
  return readFileSync(join(root, 'supabase/migrations', name), 'utf8')
}

function fnBody(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`)
  expect(start, `missing ${name}`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', start)
  expect(end, `unclosed ${name}`).toBeGreaterThan(start)
  return sql.slice(start, end + 3)
}

describe('QA3B gauntlet location / Mobile Order contract (ACH-002)', () => {
  it('ACH-002: authoritative log_counts require bar_id match and exclude virtual bars', () => {
    const sql = readMigration('20261105011000_activity_day_reporting_boundary.sql')
    const logCountsFn = fnBody(sql, 'achievement_log_counts_for_collection')
    expect(logCountsFn).toMatch(/d\.bar_id\s*=\s*bo\.bar_id/)
    expect(logCountsFn).toMatch(/is_virtual\s+is\s+false/)
  })

  it('ACH-002: covered_count live progress matches the same location guards', () => {
    const sql = readMigration('20261105011400_r7_gauntlet_covered_count_location.sql')
    const coveredCount = fnBody(sql, 'achievement_collection_covered_count')
    expect(coveredCount).toMatch(/d\.bar_id\s*=\s*bo\.bar_id/)
    expect(coveredCount).toMatch(/is_virtual\s+is\s+false/)
  })

  it('mobile-order eval patch still excludes virtual bars for distinct/grouped bar subjects', () => {
    const mo = readMigration('20261105010900_mobile_order_virtual_source.sql')
    expect(mo).toContain('b.is_virtual is false')
    expect(mo).toContain("subject' = 'bars'")
    // offering_collection delegates to helpers; location binding is in log_counts/covered_count.
    const evalSlice = mo.slice(
      mo.indexOf('create or replace function public.achievement_eval_condition_as_of('),
      mo.indexOf('comment on function public.achievement_eval_condition_as_of'),
    )
    expect(evalSlice).toContain('achievement_eval_condition_as_of_pre_mobile_order')
  })

  it('empty full_menu / threshold universes do not auto-complete (guards phantom unlocks)', () => {
    const final = readMigration('20261105009900_phase_final_achievements_catalog.sql')
    expect(final).toContain('or (v_target = 0)')
    expect(final).toContain("'verification_pending'")
    const a1 = readMigration('20261105008600_phase_a1_same_log_collections.sql')
    expect(a1).toContain('achievement_collection_live_met_config')
    expect(a1).toMatch(
      /coalesce\(\(v_resolved->>'target'\)::int, 0\) < 1 then[\s\S]{0,40}return false/,
    )
  })
})
