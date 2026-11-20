/**
 * Resolve Ship It! team + teammate display for the rules landing assignment block.
 * Uses existing get_my_shipit_home leaderboard members (no new API).
 */
import type { ShipItHomePayload, ShipItLeaderboardRow } from '@/types/shipit'

export interface ShipItAssignment {
  teamName: string
  crewNames: string[]
}

function myTeamRow(payload: ShipItHomePayload): ShipItLeaderboardRow | null {
  const rows = payload.leaderboard ?? []
  return (
    rows.find((row) => row.is_my_team) ??
    rows.find((row) => row.team_id === payload.team?.id) ??
    null
  )
}

/** Exclude the logged-in player from the Ship It! teammate list (case-insensitive). */
export function crewNamesExcludingSelf(
  members: string[] | null | undefined,
  selfDisplayName: string,
): string[] {
  const self = selfDisplayName.trim().toLowerCase()
  return (members ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== self)
}

/**
 * Returns null when the player has no Ship It! team, or when roster data is not
 * yet safe to show (missing team name / no my-team leaderboard row with members).
 */
export function resolveShipItAssignment(
  payload: ShipItHomePayload | null | undefined,
  selfDisplayName: string,
): ShipItAssignment | null {
  if (!payload?.ok || !payload.team?.name?.trim()) return null

  const row = myTeamRow(payload)
  // Leaderboard members are the existing frontend roster source. Without a
  // my-team row, do not invent teammates or flash an incomplete assignment.
  if (!row || !Array.isArray(row.members)) return null

  const teamName = (row.team_name?.trim() || payload.team.name.trim())
  if (!teamName) return null

  return {
    teamName,
    crewNames: crewNamesExcludingSelf(row.members, selfDisplayName),
  }
}
