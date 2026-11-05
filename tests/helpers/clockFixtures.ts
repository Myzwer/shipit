import { createLocalClient, loadLocalFixtures, signInAs, type LocalFixtures } from './localSupabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Development-only Day 1 = Saturday 2099-01-03 (not a production sailing date). */
export const DEV_DAY1 = '2099-01-03'
/** Base: ship local = UTC − 4 hours */
export const DEV_BASE_OFFSET_MIN = -240

export type ClockFixtures = LocalFixtures & {
  admin: SupabaseClient | null
  service: SupabaseClient | null
}

export async function loadClockFixtures(): Promise<ClockFixtures> {
  const base = await loadLocalFixtures()
  if (!base.available || !base.summary || !base.serviceRoleKey) {
    return { ...base, admin: null, service: null }
  }

  const service = createLocalClient(base.summary.supabase_url, base.serviceRoleKey)
  const { error: seedError } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  if (seedError) throw seedError

  const admin = await signInAs(base, 'admin')
  return { ...base, admin, service }
}

/** UTC instant corresponding to ship-local wall time on a given cruise day, with a known offset. */
export function shipLocalToUtcIso(
  shipDate: string,
  time: string,
  offsetMinutes: number,
): string {
  // ship = utc_wall + offset  => utc_wall = ship - offset
  const ship = new Date(`${shipDate}T${time}Z`) // interpret components as UTC then compensate
  const utcMs = ship.getTime() - offsetMinutes * 60_000
  return new Date(utcMs).toISOString()
}

export function dayDate(dayNumber: number): string {
  const d = new Date(`${DEV_DAY1}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1))
  return d.toISOString().slice(0, 10)
}
