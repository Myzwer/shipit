/**
 * QA-3A — Admin read paths with mutating / latching side effects (static contracts).
 * Backend latching is NOT executed here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('Admin read side-effects (source contracts)', () => {
  it('BarBountyCrewsSection / API call admin_list_bar_bounty_crews (crew lock risk on open)', () => {
    const section = read('src/features/admin/BarBountyCrewsSection.vue')
    const api = read('src/lib/bounty/barBountyApi.ts')
    expect(section + api).toMatch(/admin_list_bar_bounty_crews/)
  })

  it('admin_list_bar_bounty_crews migration ensures crews at clock (mutating read)', () => {
    const sql = read(
      'supabase/migrations/20261105009400_phase_b1_bar_bounty_crew_assignments.sql',
    )
    expect(sql).toMatch(/admin_list_bar_bounty_crews/)
    expect(sql).toMatch(/bar_bounty_ensure_crews_at/)
  })

  it('docs warn crews can lock on first ensure', () => {
    const docs = [
      'docs/BAR_BOUNTY_CREWS.md',
      'docs/BOUNTY_SCHEDULING.md',
    ]
      .map((p) => {
        try {
          return read(p)
        } catch {
          return ''
        }
      })
      .join('\n')
    expect(docs.length).toBeGreaterThan(0)
    expect(docs.toLowerCase()).toMatch(/crew|ensure|lock|snapshot|roster/)
  })

  it('Overview loads pause + clock diagnostics (finale latch risk on read — blocked for live proof)', () => {
    const overview = read('src/features/admin/OverviewSection.vue')
    expect(overview).toMatch(/admin_overview_summary|fetchAdminOverview|adminOverview/)
    expect(overview).toMatch(/clock|pause|drinkit/i)
  })

  it('GameStatusSection pause/resume uses request-id pending pattern', () => {
    const section = read('src/features/admin/GameStatusSection.vue')
    expect(section).toMatch(/pause-drinkit|resume-drinkit/)
    expect(section).toMatch(/pending|reconcile|retry/i)
  })

  it('ShipClockSection exposes ±1h, Set Ship Time, and Save Plan controls', () => {
    const section = read('src/features/admin/ShipClockSection.vue')
    expect(section).toContain('minus-1h')
    expect(section).toContain('plus-1h')
    expect(section).toContain('set-ship-time')
    expect(section).toContain('save-plan')
  })

  it('VoidSubmissionSection requires pasted submission UUID (no gallery search UI)', () => {
    const section = read('src/features/admin/VoidSubmissionSection.vue')
    expect(section).toContain('admin-void-submission-id')
    expect(section).not.toMatch(/searchSubmissions|listSubmissions|gallerySearch/)
  })
})

describe('Mobile Order bounty exclusion (source contracts — not live eligibility)', () => {
  it('migration 11000 documents virtual_order_source for cocktail path', () => {
    const files = readFileSync(join(ROOT, 'supabase/migrations/20261105011000_activity_day_reporting_boundary.sql'), 'utf8')
    expect(files).toMatch(/virtual_order_source/)
    expect(files).toMatch(/mobile-order|is_virtual|virtual/i)
  })

  it('client MOBILE_ORDER_BAR_KEY is defined for wizard search', () => {
    const types = read('src/types/drinkLog.ts')
    expect(types).toMatch(/MOBILE_ORDER_BAR_KEY/)
  })
})
