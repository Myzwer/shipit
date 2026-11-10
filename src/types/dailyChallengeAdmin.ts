import type { DailyChallengeParticipationMode } from '@/types/bountyHome'

export type AdminDailyChallengeRow = {
  challenge_id: string
  day_number: number
  title: string
  instructions: string
  location_name: string | null
  bar_canonical_key: string | null
  meeting_time_ship_local: string | null
  is_all_hands: boolean
  participation_mode: DailyChallengeParticipationMode
  admin_announcement: string | null
  photo_required: boolean
  points: number
}

export type AdminListDailyChallengesResult = {
  ok: boolean
  code?: string
  cruise_config_id?: string
  challenges?: AdminDailyChallengeRow[]
  actor_player_id?: string
}

export type AdminSetDailyAnnouncementResult = {
  ok: boolean
  code?: string
  changed?: boolean
  challenge_id?: string
  day_number?: number
  participation_mode?: DailyChallengeParticipationMode
  admin_announcement?: string | null
  audit_id?: string
  client_request_id?: string | null
  message?: string
}
