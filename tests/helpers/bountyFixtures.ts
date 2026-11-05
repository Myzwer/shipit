import type { SupabaseClient } from '@supabase/supabase-js'
import { buildScheduleReadyCatalog } from '../fixtures/catalog/builders'
import {
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  dayDate,
  loadClockFixtures,
  shipLocalToUtcIso,
  type ClockFixtures,
} from './clockFixtures'

export async function loadBountyFixtures(): Promise<ClockFixtures> {
  const fixtures = await loadClockFixtures()
  if (!fixtures.available || !fixtures.service) {
    throw new Error('Bounty fixtures require local Supabase + identities')
  }
  return fixtures
}

export async function activateReadyCatalogAndSchedule(
  service: SupabaseClient,
  seed = 'phase2da-seed',
  opts?: { cocktailCount?: number; ingredientCount?: number },
) {
  const catalog = buildScheduleReadyCatalog(
    opts?.cocktailCount ?? 72,
    opts?.ingredientCount ?? 39,
  )
  const { data: activated, error: aErr } = await service.rpc('dev_activate_catalog_fixture', {
    p_payload: catalog,
  })
  if (aErr) throw aErr

  const { data: schedule, error: sErr } = await service.rpc('dev_generate_bounty_schedule', {
    p_seed: seed,
  })
  if (sErr) throw sErr

  const { data: daily, error: dErr } = await service.rpc('dev_seed_daily_assignments')
  if (dErr) throw dErr

  return { catalog, activated, schedule, daily }
}

/** Schedule-ready catalog with unused Cocktail/Ingredient reserves for Admin Skip tests. */
export async function activateCatalogWithSkipReserves(
  service: SupabaseClient,
  seed = 'phase3cb-reserves',
) {
  return activateReadyCatalogAndSchedule(service, seed, {
    cocktailCount: 80,
    ingredientCount: 45,
  })
}

export function noonDay1Utc(offset = DEV_BASE_OFFSET_MIN) {
  return shipLocalToUtcIso(dayDate(1), '12:00:00', offset)
}

export function slotUtc(day: number, time: string, offset = DEV_BASE_OFFSET_MIN) {
  return shipLocalToUtcIso(dayDate(day), time, offset)
}

export { DEV_DAY1, DEV_BASE_OFFSET_MIN, dayDate, shipLocalToUtcIso }
