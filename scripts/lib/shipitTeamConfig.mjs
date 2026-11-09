/**
 * Resolve and validate Ship It! team assignments from the private roster
 * (or a sibling gitignored teams overlay). Real guest keys stay out of Git.
 *
 * Confirmed memberships live in private/roster/roster.local.json:
 *   - top-level `teams[]` + per-player `team_key`, or
 *   - optional overlay private/roster/teams.local.json
 *
 * Temporary pre-confirmation scaffolding may still use
 * `local_demo_provisional` (clearly labeled [TEMP DEMO]).
 *
 * Synthetic Demo/Gate fixtures remain the fallback when no private roster exists.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ORGANIZER_TEAM_CONTRACT = {
  teamCount: 6,
  assignedPlayers: 21,
  totalPlayers: 22,
  deliberatelyUnassignedCount: 1,
  drinkItMemberships: 11,
  /**
   * Unassigned players cannot have shipit game membership enabled:
   * DB constraint requires exactly one active team for Ship It! enrollment.
   */
  unassignedMustDisableShipIt: true,
}

/**
 * @param {string} root
 * @returns {{
 *   source: 'private_confirmed' | 'private_provisional' | 'absent',
 *   rosterPath: string | null,
 *   teamsPath: string | null,
 *   teams: Array<{ key: string, name: string, color?: string | null }>,
 *   assignments: Record<string, string | null>,
 *   players: Array<Record<string, unknown>>,
 *   unassignedKeys: string[],
 * }}
 */
export function loadPrivateShipItTeamConfig(root = process.cwd()) {
  const rosterPath = join(root, 'private/roster/roster.local.json')
  const teamsPath = join(root, 'private/roster/teams.local.json')

  if (process.env.FORCE_SYNTHETIC_ROSTER === '1' || !existsSync(rosterPath)) {
    return {
      source: 'absent',
      rosterPath: existsSync(rosterPath) ? rosterPath : null,
      teamsPath: existsSync(teamsPath) ? teamsPath : null,
      teams: [],
      assignments: {},
      players: [],
      unassignedKeys: [],
    }
  }

  const roster = JSON.parse(readFileSync(rosterPath, 'utf8'))
  const overlay = existsSync(teamsPath) ? JSON.parse(readFileSync(teamsPath, 'utf8')) : null

  const provisional = roster.local_demo_provisional
  const confirmedTeams = [
    ...(Array.isArray(roster.teams) ? roster.teams : []),
    ...(Array.isArray(overlay?.teams) ? overlay.teams : []),
  ]
  const overlayAssign = overlay?.assignments && typeof overlay.assignments === 'object' ? overlay.assignments : {}

  /** @type {Record<string, string | null>} */
  const assignments = {}
  for (const p of roster.players || []) {
    const fromPlayer = p.team_key ?? null
    const fromOverlay = Object.prototype.hasOwnProperty.call(overlayAssign, p.key)
      ? overlayAssign[p.key]
      : undefined
    const fromProvisional = provisional?.assignments?.[p.key]
    // Overlay wins, then confirmed player.team_key, then provisional scaffolding.
    const teamKey =
      fromOverlay !== undefined ? fromOverlay : fromPlayer != null ? fromPlayer : (fromProvisional ?? null)
    assignments[p.key] = teamKey
  }

  const usingConfirmed =
    confirmedTeams.length > 0 &&
    Object.values(assignments).some((k) => k && confirmedTeams.some((t) => t.key === k))

  const teams = usingConfirmed
    ? dedupeTeams(confirmedTeams)
    : dedupeTeams(provisional?.teams || [])

  const unassignedKeys = Object.entries(assignments)
    .filter(([, teamKey]) => !teamKey)
    .map(([key]) => key)

  return {
    source: usingConfirmed ? 'private_confirmed' : 'private_provisional',
    rosterPath,
    teamsPath: existsSync(teamsPath) ? teamsPath : null,
    teams,
    assignments,
    players: roster.players || [],
    unassignedKeys,
  }
}

function dedupeTeams(teams) {
  const seen = new Set()
  const out = []
  for (const t of teams) {
    if (!t?.key || seen.has(t.key)) continue
    seen.add(t.key)
    out.push({ key: t.key, name: t.name || t.key, color: t.color ?? null })
  }
  return out
}

/**
 * Fail closed when a private roster is present but organizer team memberships
 * are missing or inconsistent. Synthetic fixtures skip this gate.
 *
 * @param {ReturnType<typeof loadPrivateShipItTeamConfig>} cfg
 * @param {{ requireConfirmed?: boolean }} [opts]
 */
export function assertOrganizerShipItTeams(cfg, opts = {}) {
  const requireConfirmed = opts.requireConfirmed !== false
  if (cfg.source === 'absent') {
    return { ok: true, mode: 'synthetic_fallback', message: 'No private roster — synthetic teams allowed.' }
  }

  if (requireConfirmed && cfg.source !== 'private_confirmed') {
    throw new Error(
      'SHIPIT_TEAMS: private roster is present but organizer-confirmed teams are missing. ' +
        'Set top-level teams[] + player team_key values (or private/roster/teams.local.json). ' +
        'Refusing to seed with obsolete provisional/[TEMP DEMO] assignments.',
    )
  }

  const errors = []
  if (cfg.teams.length !== ORGANIZER_TEAM_CONTRACT.teamCount) {
    errors.push(`expected ${ORGANIZER_TEAM_CONTRACT.teamCount} teams, found ${cfg.teams.length}`)
  }

  const teamKeys = new Set(cfg.teams.map((t) => t.key))
  const assigned = Object.entries(cfg.assignments).filter(([, k]) => k)
  if (assigned.length !== ORGANIZER_TEAM_CONTRACT.assignedPlayers) {
    errors.push(
      `expected ${ORGANIZER_TEAM_CONTRACT.assignedPlayers} assigned players, found ${assigned.length}`,
    )
  }

  for (const [playerKey, teamKey] of assigned) {
    if (!teamKeys.has(teamKey)) {
      errors.push(`player ${playerKey} references unknown team_key "${teamKey}"`)
    }
  }

  if (cfg.unassignedKeys.length !== ORGANIZER_TEAM_CONTRACT.deliberatelyUnassignedCount) {
    errors.push(
      `expected ${ORGANIZER_TEAM_CONTRACT.deliberatelyUnassignedCount} deliberately unassigned player(s), found ${cfg.unassignedKeys.length}`,
    )
  }

  for (const key of cfg.unassignedKeys) {
    const row = cfg.players.find((p) => p.key === key)
    if (ORGANIZER_TEAM_CONTRACT.unassignedMustDisableShipIt && row?.ship_it) {
      errors.push(
        `unassigned player has ship_it=true; disable Ship It! membership until a team is chosen (DB constraint)`,
      )
    }
  }

  if (cfg.players.length !== ORGANIZER_TEAM_CONTRACT.totalPlayers) {
    errors.push(
      `expected ${ORGANIZER_TEAM_CONTRACT.totalPlayers} roster players, found ${cfg.players.length}`,
    )
  }

  const drinkIt = cfg.players.filter((p) => p.drink_it).length
  if (drinkIt !== ORGANIZER_TEAM_CONTRACT.drinkItMemberships) {
    errors.push(
      `expected ${ORGANIZER_TEAM_CONTRACT.drinkItMemberships} Drink It! memberships, found ${drinkIt}`,
    )
  }

  // Drink It! exclusion is validated by membership count (11). Specific excluded
  // guest keys stay only in the gitignored private roster.

  // Every team must have at least one member.
  for (const t of cfg.teams) {
    const n = assigned.filter(([, k]) => k === t.key).length
    if (n < 1) errors.push(`team ${t.key} has no members`)
  }

  if (errors.length) {
    throw new Error(`SHIPIT_TEAMS: invalid organizer team configuration:\n- ${errors.join('\n- ')}`)
  }

  return {
    ok: true,
    mode: cfg.source,
    teamCount: cfg.teams.length,
    assignedCount: assigned.length,
    unassignedCount: cfg.unassignedKeys.length,
    unassignedKeys: cfg.unassignedKeys,
  }
}

/**
 * Mid-cruise scavenger plan keyed by team_key (not private player keys).
 * At seed time each row is submitted by a rotating member of that team.
 * Point totals (authentic catalog points, one completion per team):
 *   team_3 2400 | team_5 1900 | team_1 1600 | team_6 1300 | team_2 1100 | team_4 700
 */
export const PRIVATE_TUESDAY_SCAVENGER_PLAN = [
  // team_3 — 2400
  { teamKey: 'team_3', challengeKey: 'the-piazza-grandeur', day: 1, hour: '11:00:00' },
  { teamKey: 'team_3', challengeKey: 'movies-under-the-stars', day: 1, hour: '16:00:00' },
  { teamKey: 'team_3', challengeKey: 'under-the-dome', day: 2, hour: '10:30:00' },
  { teamKey: 'team_3', challengeKey: 'international-cafe', day: 1, hour: '13:30:00' },
  { teamKey: 'team_3', challengeKey: 'soft-serve-swirl', day: 2, hour: '14:00:00' },
  { teamKey: 'team_3', challengeKey: 'poolside-slice', day: 3, hour: '12:00:00' },
  { teamKey: 'team_3', challengeKey: 'carpet-compass', day: 2, hour: '17:00:00' },
  { teamKey: 'team_3', challengeKey: 'elevator-map', day: 3, hour: '15:00:00' },
  { teamKey: 'team_3', challengeKey: 'crew-high-five', day: 3, hour: '18:00:00' },
  { teamKey: 'team_3', challengeKey: 'wind-tunnel', day: 4, hour: '11:00:00' },

  // team_5 — 1900
  { teamKey: 'team_5', challengeKey: 'miniature-masterpiece', day: 1, hour: '12:00:00' },
  { teamKey: 'team_5', challengeKey: 'lotus-spa-zen', day: 1, hour: '17:00:00' },
  { teamKey: 'team_5', challengeKey: 'front-row-center', day: 2, hour: '11:00:00' },
  { teamKey: 'team_5', challengeKey: 'omalleys-irish-pub', day: 2, hour: '13:00:00' },
  { teamKey: 'team_5', challengeKey: 'tropical-paradise', day: 3, hour: '12:30:00' },
  { teamKey: 'team_5', challengeKey: 'sweet-treat', day: 3, hour: '16:00:00' },
  { teamKey: 'team_5', challengeKey: 'stateroom-door-flair', day: 2, hour: '18:00:00' },
  { teamKey: 'team_5', challengeKey: 'nautical-rose', day: 3, hour: '17:30:00' },
  { teamKey: 'team_5', challengeKey: 'the-cruise-guide', day: 4, hour: '10:30:00' },

  // team_1 — 1600
  { teamKey: 'team_1', challengeKey: 'casino-neon', day: 1, hour: '14:00:00' },
  { teamKey: 'team_1', challengeKey: 'art-critic', day: 2, hour: '10:00:00' },
  { teamKey: 'team_1', challengeKey: 'buffet-multi-tasker', day: 2, hour: '12:30:00' },
  { teamKey: 'team_1', challengeKey: 'main-dining-elegance', day: 3, hour: '11:30:00' },
  { teamKey: 'team_1', challengeKey: 'safety-first', day: 3, hour: '14:00:00' },
  { teamKey: 'team_1', challengeKey: 'trivia-masters', day: 3, hour: '19:00:00' },
  { teamKey: 'team_1', challengeKey: 'towel-zoo', day: 4, hour: '12:00:00' },

  // team_6 — 1300
  { teamKey: 'team_6', challengeKey: 'gym-buffs', day: 1, hour: '15:00:00' },
  { teamKey: 'team_6', challengeKey: 'guest-services', day: 2, hour: '09:30:00' },
  { teamKey: 'team_6', challengeKey: 'good-spirits-mixology', day: 2, hour: '15:00:00' },
  { teamKey: 'team_6', challengeKey: 'room-service-delivery', day: 3, hour: '10:00:00' },
  { teamKey: 'team_6', challengeKey: 'deck-13-mystery', day: 3, hour: '13:00:00' },
  { teamKey: 'team_6', challengeKey: 'live-music-backdrop', day: 4, hour: '11:30:00' },

  // team_2 — 1100
  { teamKey: 'team_2', challengeKey: 'high-wind-warning', day: 1, hour: '18:00:00' },
  { teamKey: 'team_2', challengeKey: 'ocean-lookout', day: 3, hour: '11:00:00' },
  { teamKey: 'team_2', challengeKey: 'bingo-champion', day: 4, hour: '09:30:00' },

  // team_4 — 700
  { teamKey: 'team_4', challengeKey: 'lounge-spotlight', day: 2, hour: '14:30:00' },
  { teamKey: 'team_4', challengeKey: 'deck-dance-move', day: 4, hour: '10:00:00' },
]

/** Expected derived team point totals keyed by temporary team display name. */
export const PRIVATE_TUESDAY_EXPECTED_POINTS = {
  'Team 3': 2400,
  'Team 5': 1900,
  'Team 1': 1600,
  'Team 6': 1300,
  'Team 2': 1100,
  'Team 4': 700,
}

/**
 * Resolve a rotating submitter for a team from provisioned identities.
 * Prefers non-admin members when available so admin is not every submitter.
 */
export function pickTeamSubmitter(members, completionIndex) {
  if (!members?.length) return null
  const preferred = members.filter((m) => !m.is_admin)
  const pool = preferred.length ? preferred : members
  return pool[completionIndex % pool.length]
}

/**
 * Synthetic Demo/Gate Tuesday plan (2 teams) — preserved for CI without private roster.
 * Alpha (both+ship): 100+100+200 = 400; Bravo (admin): 200+200 = 400.
 */
export const SYNTHETIC_TUESDAY_SCAVENGER_PLAN = [
  { playerKey: 'both', challengeKey: 'the-piazza-grandeur', day: 1, hour: '11:00:00' },
  { playerKey: 'both', challengeKey: 'movies-under-the-stars', day: 1, hour: '16:00:00' },
  { playerKey: 'ship_only', challengeKey: 'soft-serve-swirl', day: 3, hour: '12:00:00' },
  { playerKey: 'admin', challengeKey: 'international-cafe', day: 2, hour: '11:30:00' },
  { playerKey: 'admin', challengeKey: 'omalleys-irish-pub', day: 2, hour: '14:00:00' },
]
