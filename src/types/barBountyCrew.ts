/**
 * Phase B1 Bar Bounty crew assignment data contract.
 * Scoring / UI consume these shapes in B2+; B1 provides server RPCs only.
 */

export type BarBountyCrewMember = {
  player_id: string
  display_name: string
  is_self?: boolean
}

export type BarBountyCrewGroup = {
  crew_id: string
  crew_index: number
  size: 3 | 4
  members: BarBountyCrewMember[]
}

export type MyBarBountyCrewAssigned = {
  ok: true
  status: 'assigned'
  cruise_day: number
  crew_day_id: string
  crew_id: string
  crew_size: 3 | 4
  members: BarBountyCrewMember[]
  generated_at_utc: string
}

export type MyBarBountyCrewUnassigned = {
  ok: true
  status: 'unassigned'
  reason: 'not_in_todays_roster'
  cruise_day: number
  crew_day_id: string
  message: string
}

export type MyBarBountyCrewUnavailable = {
  ok: false
  status: 'roster_too_small' | 'unavailable'
  code: string
  message?: string
  reason?: string
  cruise_day?: number
  roster_size?: number
  minimum_roster?: number
}

export type MyBarBountyCrewResult =
  | MyBarBountyCrewAssigned
  | MyBarBountyCrewUnassigned
  | MyBarBountyCrewUnavailable

export type AdminBarBountyCrewsActive = {
  ok: true
  status: 'active'
  crew_day_id: string
  cruise_config_id: string
  cruise_day: number
  roster_size: number
  generated_at_utc: string
  seed: string
  algorithm_version: string
  crews: BarBountyCrewGroup[]
  actor_id?: string
}

export type AdminBarBountyCrewsIssue = {
  ok: false
  status: 'roster_too_small' | 'unavailable'
  code: string
  message: string
  reason?: string
  cruise_day?: number
  roster_size?: number
  minimum_roster?: number
  issue?: {
    code: 'ROSTER_TOO_SMALL'
    message: string
    roster_size: number
    minimum_roster: number
  } | null
  actor_id?: string
}

export type AdminBarBountyCrewsResult = AdminBarBountyCrewsActive | AdminBarBountyCrewsIssue

/** B2 scoring presence bands (not implemented in B1). */
export const BAR_BOUNTY_CREW_SCORE_BANDS = {
  solo: 0,
  twoPresent: 20,
  threeOfThree: 40,
  threeOfFour: 30,
  fourOfFour: 40,
} as const
