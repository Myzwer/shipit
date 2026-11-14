/**
 * B2 test helpers for locked daily crews. Synthetic ids only.
 * B1 requires ≥7 active Drink It! players to generate crews.
 * Callers must dispose tracked player ids via disposePlayers() so Auth-less
 * fixtures cannot accumulate when achievement_awards block a bare delete.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { disposePlayers } from './disposePlayers'

export { disposePlayers }

export type EnsuredCrews = {
  ok: true
  cruise_config_id: string
  cruise_day: number
  crew_day_id: string
  crews: Array<{
    crew_id: string
    size: number
    members: Array<{ player_id: string; display_name: string }>
  }>
}

/** Create disposable Drink It! members to pad a crew roster to ≥7. */
export async function createDrinkitFillers(
  service: SupabaseClient,
  count: number,
  prefix: string,
  track?: string[],
) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const token = randomUUID().slice(0, 8)
    const { data, error } = await service
      .from('players')
      .insert({
        display_name: `Crew Fill ${prefix} ${i} ${token}`,
        login_alias: `crew-fill-${prefix}-${i}-${token}`,
        is_admin: false,
        active: true,
      })
      .select('id')
      .single()
    if (error) throw error
    ids.push(data.id)
    track?.push(data.id)
    await service.from('game_memberships').insert({
      player_id: data.id,
      game: 'drinkit',
      enabled: true,
    })
  }
  return ids
}

/** Pad core players with fillers until the roster has at least `minSize` members. */
export async function padCrewRoster(
  service: SupabaseClient,
  core: string[],
  prefix: string,
  track?: string[],
  minSize = 7,
) {
  if (core.length >= minSize) return [...core]
  const fillers = await createDrinkitFillers(service, minSize - core.length, prefix, track)
  return [...core, ...fillers]
}

export async function ensureCrewAssignment(
  service: SupabaseClient,
  atUtc: string,
  roster: string[],
  seed = 'b2-crew',
) {
  if (roster.length < 7) {
    throw new Error(`crew roster must have ≥7 players (got ${roster.length})`)
  }
  const { data, error } = await service.rpc('dev_ensure_bar_bounty_crews_at', {
    p_at_utc: atUtc,
    p_seed: seed,
    p_roster_override: roster,
  })
  if (error) throw error
  if (!data?.ok) throw new Error(`crew ensure failed: ${JSON.stringify(data)}`)
  return data as EnsuredCrews
}

export function crewForPlayer(ensured: EnsuredCrews, playerId: string) {
  const crew = ensured.crews.find((c) => c.members.some((m) => m.player_id === playerId))
  if (!crew) throw new Error(`player ${playerId} not assigned`)
  const mates = crew.members.map((m) => m.player_id).filter((id) => id !== playerId)
  return { crewId: crew.crew_id as string, size: crew.size as 3 | 4, mates }
}

/** Pick any player who landed in a crew of the requested size. */
export function pickPlayerInCrewSize(ensured: EnsuredCrews, size: 3 | 4) {
  const crew = ensured.crews.find((c) => c.size === size)
  if (!crew) throw new Error(`no crew of size ${size}`)
  const playerId = crew.members[0]!.player_id
  return { playerId, ...crewForPlayer(ensured, playerId), crew }
}

export async function mateIds(
  service: SupabaseClient,
  cruiseConfigId: string,
  day: number,
  playerId: string,
) {
  const { data, error } = await service.rpc('bar_bounty_crew_mate_ids', {
    p_cruise_config_id: cruiseConfigId,
    p_day_number: day,
    p_player_id: playerId,
  })
  if (error) throw error
  return (data ?? []) as string[]
}
