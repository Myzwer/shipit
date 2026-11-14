/**
 * R5 / REP-SCHED-001 — static contracts for production schedule initialization.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('R5 production bounty schedule init (static)', () => {
  it('migration defines Admin init + status + reconcile RPCs', () => {
    const mig = readdirSync(resolve(ROOT, 'supabase/migrations')).find((f) =>
      f.includes('admin_initialize_bounty_schedule'),
    )
    expect(mig).toBeTruthy()
    const sql = read(`supabase/migrations/${mig}`)
    expect(sql).toMatch(/create or replace function public\.admin_initialize_bounty_schedule/)
    expect(sql).toMatch(/admin_get_bounty_schedule_status/)
    expect(sql).toMatch(/admin_find_bounty_schedule_init_request_by_id/)
    expect(sql).toMatch(/admin_bounty_schedule_init_requests/)
    expect(sql).toMatch(/SCHEDULE_ALREADY_INITIALIZED/)
    expect(sql).toMatch(/SCHEDULE_INCOMPLETE_OR_CORRUPT/)
    expect(sql).toMatch(/CRUISE_FINALIZED/)
    expect(sql).toMatch(/wake-view-bar/)
    expect(sql).toMatch(/promenade-bars/)
    expect(sql).toMatch(/is_virtual/)
    expect(sql).toMatch(/mobile-order/)
    expect(sql).toMatch(/gameplay_started/)
    expect(sql).not.toMatch(/DEV_SCHEDULE_FORBIDDEN/)
  })

  it('Admin lib + pending + section exist and wire Drink It Admin', () => {
    expect(existsSync(resolve(ROOT, 'src/lib/adminBountyScheduleInit.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'src/lib/pendingBountyScheduleInit.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'src/features/admin/BountyScheduleInitSection.vue'))).toBe(true)
    const drinkit = read('src/features/admin/DrinkItAdminSection.vue')
    expect(drinkit).toMatch(/BountyScheduleInitSection/)
    const lib = read('src/lib/adminBountyScheduleInit.ts')
    expect(lib).toContain("'admin_initialize_bounty_schedule'")
    expect(lib).toContain("'admin_get_bounty_schedule_status'")
    expect(lib).toContain("'admin_find_bounty_schedule_init_request_by_id'")
    const session = read('src/stores/session.ts')
    expect(session).toMatch(/clearPendingBountyScheduleInit/)
  })

  it('does not bundle service_role credentials into Admin schedule client', () => {
    const lib = read('src/lib/adminBountyScheduleInit.ts')
    expect(lib).not.toMatch(/SERVICE_ROLE|service_role/)
    expect(lib).toMatch(/isSupabaseConfigured/)
  })
})
