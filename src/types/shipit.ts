export type ScavengerCategory =
  | 'classic_ship_landmarks'
  | 'food_and_drink_discoveries'
  | 'quirky_details_and_hidden_artifacts'
  | 'interactive_crew_and_activity'
  | 'creative_team_and_action_shots'

export type ShipItLifecycleStatus =
  | 'unconfigured'
  | 'pre_cruise'
  | 'active'
  | 'finale'
  | 'post_cruise'

export interface ShipItLifecycle {
  ok: boolean
  status: ShipItLifecycleStatus
  read_only: boolean
  accepting_submissions: boolean
  cruise_config_id?: string
  cruise_day?: number | null
  ship_date?: string
  ship_local?: string
  finale_at_utc?: string
  at_utc?: string
  reason?: string
}

export interface ShipItCategoryProgress {
  category: ScavengerCategory
  label: string
  points_per_challenge?: number
  completed: number
  total: number
  points: number
  sort_order?: number
}

export interface ShipItLeaderboardRow {
  team_id: string
  team_name: string
  members: string[]
  completed: number
  total?: number
  points: number
  rank: number
  is_my_team?: boolean
}

export interface ShipItHomePayload {
  ok: boolean
  lifecycle: ShipItLifecycle
  team: {
    id: string
    name: string
    completed?: number
    points?: number
  }
  overall: {
    completed: number
    total: number
    points: number
  }
  categories: ShipItCategoryProgress[]
  leaderboard: ShipItLeaderboardRow[]
}

export interface ShipItChallengeCard {
  id: string
  canonical_key: string
  category: ScavengerCategory
  title: string
  instructions: string
  points: number
  sort_order: number
  photo_required: boolean
  completed: boolean
  actionable: boolean
  submission_ready: boolean
}

export interface ShipItChallengeSection {
  category: ScavengerCategory
  label: string
  points_per_challenge: number
  completed: number
  total: number
  points: number
  challenges: ShipItChallengeCard[]
}

export interface ShipItChallengesPayload {
  ok: boolean
  code?: string
  message?: string
  lifecycle: ShipItLifecycle
  team: { id: string; name: string }
  filter: string
  sections: ShipItChallengeSection[]
  submission_available: boolean
  submission_blocked_reason?: string
}

export type ShipItFilter = 'all' | ScavengerCategory
