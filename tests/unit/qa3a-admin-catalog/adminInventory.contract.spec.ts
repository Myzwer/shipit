/**
 * QA3A — Admin surface inventory (PASS-oriented, static source checks).
 *
 * NOTE: Mutating integration tests (roster create/reset, clock ±1h, skip, void, publish,
 * rollback) are BLOCKED without an isolated Supabase environment. Nothing here talks to a
 * backend.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

const SECTION_FILES = [
  'AddDrinkSection.vue',
  'AdminView.vue',
  'BarBountyCrewsSection.vue',
  'BountyScheduleInitSection.vue',
  'BountySkipSection.vue',
  'CatalogAdminSection.vue',
  'CatalogExportSection.vue',
  'CatalogImportSection.vue',
  'DailyAnnouncementsSection.vue',
  'DrinkItAdminSection.vue',
  'GameStatusSection.vue',
  'OverviewSection.vue',
  'RosterSection.vue',
  'ShipClockSection.vue',
  'VoidSubmissionSection.vue',
]

const CRITICAL_RPCS = [
  'admin_list_roster',
  'admin_list_teams',
  'admin_set_player_access',
  'admin_find_roster_access_request_by_id',
  'admin_find_roster_auth_request_by_id',
  'admin_get_clock_diagnostics',
  'admin_apply_manual_clock_correction',
  'admin_apply_manual_clock_set',
  'admin_find_clock_event_by_request_id',
  'admin_save_ship_clock_plan',
  'admin_skip_current_bounty',
  'admin_find_bounty_skip_request_by_id',
  'admin_initialize_bounty_schedule',
  'admin_get_bounty_schedule_status',
  'admin_find_bounty_schedule_init_request_by_id',
  'admin_void_submission',
  'admin_find_void_request_by_id',
  'admin_stage_catalog_import',
  'admin_publish_catalog_import',
  'admin_rollback_catalog',
  'admin_preview_catalog_publish',
  'admin_find_catalog_publish_request_by_id',
  'admin_list_catalog_versions',
  'admin_set_drinkit_paused',
  'admin_add_drink',
  'admin_overview_summary',
]

function allLibSource(): string {
  const dirs = ['src/lib', 'src/lib/admin']
  let out = ''
  for (const d of dirs) {
    for (const f of readdirSync(resolve(ROOT, d)).filter((n) => n.endsWith('.ts'))) {
      out += `\n/* ${d}/${f} */\n` + read(`${d}/${f}`)
    }
  }
  return out
}

describe('admin inventory (static)', () => {
  it('all Admin Vue section files exist under src/features/admin/', () => {
    for (const f of SECTION_FILES) {
      expect(existsSync(resolve(ROOT, 'src/features/admin', f)), f).toBe(true)
    }
  })

  it('AdminView imports the five top-level sections', () => {
    const view = read('src/features/admin/AdminView.vue')
    for (const c of [
      'OverviewSection',
      'RosterSection',
      'DrinkItAdminSection',
      'ShipClockSection',
      'CatalogAdminSection',
    ]) {
      expect(view).toMatch(new RegExp(`import ${c} from '@/features/admin/${c}\\.vue'`))
    }
  })

  it('critical admin RPC string literals exist across admin lib files', () => {
    const src = allLibSource()
    for (const rpcName of CRITICAL_RPCS) {
      expect(src, rpcName).toContain(`'${rpcName}'`)
    }
  })

  it('admin-roster Edge Function exists and is invoked by adminRoster.ts', () => {
    expect(existsSync(resolve(ROOT, 'supabase/functions/admin-roster/index.ts'))).toBe(true)
    expect(read('src/lib/adminRoster.ts')).toContain("functions.invoke('admin-roster'")
  })
})
