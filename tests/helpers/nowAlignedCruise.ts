/**
 * Align a development-only cruise so wall-clock now() falls at a chosen ship-local time.
 * Used for authenticated zero-arg player RPC / browser tests. Never exposes service role to the SPA.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { activateReadyCatalogAndSchedule } from './bountyFixtures'

export function computeNowAlignedCruise(options?: {
  /** Desired ship-local hour (0–23). Default 13 (1 PM open window). */
  targetHour?: number
  targetMinute?: number
  /** Cruise day number for the aligned instant (1–7). Default 1. */
  cruiseDay?: number
}) {
  const targetHour = options?.targetHour ?? 13
  const targetMinute = options?.targetMinute ?? 30
  const cruiseDay = options?.cruiseDay ?? 1
  const now = Date.now()

  // Provisional ship date from UTC calendar (good enough for local fixtures).
  const provisional = new Date(now)
  const y = provisional.getUTCFullYear()
  const mo = String(provisional.getUTCMonth() + 1).padStart(2, '0')
  const da = String(provisional.getUTCDate()).padStart(2, '0')
  const shipDateOnDay = `${y}-${mo}-${da}`

  // day1 is cruiseDay-1 days before the ship date of "now".
  const day1Date = new Date(`${shipDateOnDay}T12:00:00Z`)
  day1Date.setUTCDate(day1Date.getUTCDate() - (cruiseDay - 1))
  const day1 = day1Date.toISOString().slice(0, 10)

  const targetShipWall = Date.parse(
    `${shipDateOnDay}T${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}:00Z`,
  )
  // ship_local = utc + offset_minutes → offset = (ship_wall_as_utc - now) / 60000
  const offsetMinutes = Math.round((targetShipWall - now) / 60_000)

  return { day1, offsetMinutes, shipDateOnDay, targetHour, targetMinute, cruiseDay }
}

export async function seedNowAlignedSchedule(
  service: SupabaseClient,
  options?: Parameters<typeof computeNowAlignedCruise>[0] & { seed?: string },
) {
  const aligned = computeNowAlignedCruise(options)
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: aligned.day1,
    p_base_offset_minutes: aligned.offsetMinutes,
    p_label: 'development-only',
  })
  if (error) throw error
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  const schedule = await activateReadyCatalogAndSchedule(service, options?.seed ?? 'phase2db1-now')
  return { ...aligned, ...schedule }
}
