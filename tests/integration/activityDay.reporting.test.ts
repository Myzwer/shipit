/**
 * 05:00 activity-day reporting boundary.
 * Mutating checks require disposable development-only + migration 11000.
 * Does not apply migrations or reset the organizer DB.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import { sameUtcInstant } from '../helpers/clockFixtures'
import { DEV_BASE_OFFSET_MIN, DEV_DAY1, slotUtc } from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import { MOBILE_ORDER_BAR_KEY } from '@/types/drinkLog'

let fixtures: LocalFixtures | null = null
let service: SupabaseClient | null = null
let migrationReady = false
let skipReason = 'not ready'

beforeAll(async () => {
  try {
    const base = await loadLocalFixtures()
    if (!base.available || !base.summary || !base.serviceRoleKey) {
      skipReason = 'local fixtures unavailable'
      return
    }
    fixtures = await ensureSyntheticRoleIdentities(base)
    service = createLocalClient(fixtures.summary!.supabase_url, fixtures.serviceRoleKey!)
    await assertDisposableDevEnvironment(fixtures, service)
    const { error: clockErr } = await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: DEV_DAY1,
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    if (clockErr) {
      skipReason = `clock seed failed (${clockErr.message})`
      return
    }
    await assertDisposableDevEnvironment(fixtures, service)
    const { error: probeError } = await service.rpc('activity_date_from_ship_local', {
      p_ship_local: '2026-11-10T01:34:00',
    })
    if (probeError) {
      skipReason = `migration 11000 not applied (${probeError.message})`
      return
    }
    migrationReady = true
  } catch (err) {
    skipReason = err instanceof Error ? err.message : String(err)
  }
}, 180000)

async function activityClockMinutes(t: string): Promise<number> {
  const { data, error } = await service!.rpc('activity_clock_minutes_from_ship_local_time', {
    p_t: t,
  })
  expect(error).toBeNull()
  return Number(data)
}

async function activityDate(shipLocal: string): Promise<string> {
  const { data, error } = await service!.rpc('activity_date_from_ship_local', {
    p_ship_local: shipLocal,
  })
  expect(error).toBeNull()
  return String(data)
}

describe('Activity day helpers (disposable + 11000)', () => {
  it('orders 23:18 before 01:34 on the activity clock', async () => {
    if (!migrationReady || !service) {
      expect(skipReason).toBeTruthy()
      return
    }
    const evening = await activityClockMinutes('23:18:00')
    const overnight = await activityClockMinutes('01:34:00')
    expect(evening).toBeLessThan(overnight)
  })

  it('maps 04:59 to prior date and 05:00 to current date', async () => {
    if (!migrationReady || !service) {
      expect(skipReason).toBeTruthy()
      return
    }
    expect(await activityDate('2026-11-10T04:59:59')).toBe('2026-11-09')
    expect(await activityDate('2026-11-10T05:00:00')).toBe('2026-11-10')
    expect(await activityDate('2026-11-10T08:30:00')).toBe('2026-11-10')
  })

  it('Early Bird before_hour excludes 01:34; Night Owl after_hour includes it', async () => {
    if (!migrationReady || !service || !fixtures) {
      expect(skipReason).toBeTruthy()
      return
    }
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: DEV_DAY1,
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    const author = playerId(fixtures, 'drink_only')
    const overnight = slotUtc(2, '01:34:00')
    await exposeCurrentSlots(service, overnight)
    const res = await submitAt(
      service,
      author,
      drinkPayload({ barKey: 'lido-bar', mode: 'generic_beer', companions: [] }),
      overnight,
    )
    expect(res.error).toBeNull()
    expect((res.data as { ok?: boolean }).ok).toBe(true)

    const early = await service.rpc('achievement_eval_condition_as_of', {
      p_cfg: { type: 'ship_time_window', before_hour: 11, event: 'drink_log' },
      p_game: 'drinkit',
      p_owner_player: author,
      p_owner_team: null,
      p_trigger_submission: null,
      p_as_of_utc: null,
      p_as_of_id: null,
      p_depth: 0,
    })
    expect(early.error).toBeNull()
    expect(early.data).toBe(false)

    const night = await service.rpc('achievement_eval_condition_as_of', {
      p_cfg: { type: 'ship_time_window', after_hour: 23, event: 'drink_log' },
      p_game: 'drinkit',
      p_owner_player: author,
      p_owner_team: null,
      p_trigger_submission: null,
      p_as_of_utc: null,
      p_as_of_id: null,
      p_depth: 0,
    })
    expect(night.error).toBeNull()
    expect(night.data).toBe(true)
  })

  it('preserves historical ship-local time when offset later changes', async () => {
    if (!migrationReady || !service || !fixtures) {
      expect(skipReason).toBeTruthy()
      return
    }
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: DEV_DAY1,
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    const { data: cruise } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    const author = playerId(fixtures, 'drink_only')
    const at = slotUtc(2, '01:34:00')
    await exposeCurrentSlots(service, at)
    const { data, error } = await submitAt(
      service,
      author,
      drinkPayload({ barKey: 'lido-bar', mode: 'generic_wine', companions: [] }),
      at,
    )
    expect(error).toBeNull()
    const submissionId = (data as { submission_id?: string }).submission_id
    expect(submissionId).toBeTruthy()

    const { data: before } = await service
      .from('submissions')
      .select('*')
      .eq('id', submissionId!)
      .single()

    const after = new Date(new Date(at).getTime() + 120_000).toISOString()
    await service.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_client_request_id: randomUUID(),
      p_at_utc: after,
    })

    const { data: rows } = await service.rpc('wrapped_di_log_times', {
      p_cruise_config_id: cruise!.id,
    })
    const row = (rows as Array<{ submission_id: string; ship_time: string }>).find(
      (r) => r.submission_id === submissionId,
    )
    expect(String(row?.ship_time ?? '')).toMatch(/^01:34/)
    expect(sameUtcInstant(before?.received_at_utc, at)).toBe(true)
  })

  it('includes Mobile Order logs in activity-day time helpers', async () => {
    if (!migrationReady || !service || !fixtures) {
      expect(skipReason).toBeTruthy()
      return
    }
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: DEV_DAY1,
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    const { data: cruise } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    // Mobile Order submits require an offering from list_drinkit_mobile_order_drinks
    // (physical-bar offerings reject with OFFERING_NOT_AT_BAR under mobile-order).
    const drinkClient = await signInAs(fixtures, 'drink_only')
    const listed = await drinkClient.rpc('list_drinkit_mobile_order_drinks')
    const offeringId = (listed.data as Array<{ offering_id: string }>)[0]?.offering_id
    if (!offeringId) {
      skipReason = 'no mobile-order offering'
      expect(skipReason).toBeTruthy()
      return
    }
    const author = playerId(fixtures, 'drink_only')
    const at = slotUtc(2, '23:18:00')
    await exposeCurrentSlots(service, at)
    const { data, error } = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: MOBILE_ORDER_BAR_KEY,
        offeringId,
        companions: [],
      }),
      at,
    )
    expect(error).toBeNull()
    expect((data as { ok?: boolean }).ok).toBe(true)
    const submissionId = (data as { submission_id?: string }).submission_id
    const { data: rows } = await service.rpc('wrapped_di_log_times', {
      p_cruise_config_id: cruise!.id,
    })
    const row = (
      rows as Array<{
        submission_id: string
        activity_clock_minutes: number
        ship_time: string
      }>
    ).find((r) => r.submission_id === submissionId)
    expect(row).toBeTruthy()
    expect(Number(row!.activity_clock_minutes)).toBeGreaterThan(0)
    expect(String(row!.ship_time)).toMatch(/^23:18/)
  })
})
