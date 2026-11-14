/**
 * Shared teardown for disposable synthetic players inserted by integration tests.
 * Deletes FK blockers (awards, crew members, authored submissions) before players
 * so silent orphan accumulation cannot recur when a plain players.delete() would fail.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function disposePlayers(service: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100)
    const awards = await service.from('achievement_awards').delete().in('owner_player_id', batch)
    if (awards.error) throw awards.error
    const crews = await service.from('bar_bounty_crew_members').delete().in('player_id', batch)
    if (crews.error) throw crews.error
    // Fillers who author drink/scavenger submissions block players.delete via
    // submissions_author_player_id_fkey — remove those rows first (cascades cover logs).
    const authored = await service.from('submissions').delete().in('author_player_id', batch)
    if (authored.error) throw authored.error
    // Cascades cover game_memberships / team_memberships / read_cursors, but explicit
    // deletes keep teardown resilient if a future FK loses ON DELETE CASCADE.
    const memberships = await service.from('game_memberships').delete().in('player_id', batch)
    if (memberships.error) throw memberships.error
    const teams = await service.from('team_memberships').delete().in('player_id', batch)
    if (teams.error) throw teams.error
    const accessReqs = await service.from('admin_roster_access_requests').delete().in('player_id', batch)
    if (accessReqs.error) throw accessReqs.error
    const authReqs = await service.from('admin_roster_auth_requests').delete().in('player_id', batch)
    if (authReqs.error) throw authReqs.error
    const players = await service.from('players').delete().in('id', batch)
    if (players.error) throw players.error
  }
}
