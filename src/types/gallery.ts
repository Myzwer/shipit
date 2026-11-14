import type { PhotoFramingWire } from '@/lib/media/framing'
import type { GameId } from '@/types/game'

export type GalleryFilter = 'everyone' | 'mine' | 'team'

export type GalleryEventKind = 'drink_log' | 'daily' | 'scavenger' | 'achievement'

export type GalleryReactionEmoji = 'heart' | 'laugh' | 'hang_loose'

export interface GalleryReactionCounts {
  heart: number
  laugh: number
  hang_loose: number
}

export interface GalleryCursor {
  created_at_utc: string
  id: string
}

export interface GalleryFeedEvent {
  event_id: string
  kind: GalleryEventKind
  created_at_utc: string
  /** Ship-local wall time at event UTC (server historical offset). */
  created_ship_local: string | null
  owner_player_id: string | null
  owner_player_name: string | null
  owner_team_id: string | null
  owner_team_name: string | null
  submission_id: string | null
  achievement_award_id?: string | null
  caption: string | null
  photo_id: string | null
  /** Bound photo natural width when photo_id is present. */
  photo_width?: number | null
  /** Bound photo natural height when photo_id is present. */
  photo_height?: number | null
  /** Non-destructive square framing; omit/null → centered cover. */
  photo_framing?: PhotoFramingWire | null
  /**
   * Authorized companion display names for drink_log posts only.
   * Resolved server-side from recorded drink_log_companions (never client-inferred).
   */
  companion_names?: string[]
  display: Record<string, unknown>
  reactions: GalleryReactionCounts
  my_reaction: GalleryReactionEmoji | null
}

export interface GalleryFeedPage {
  ok: boolean
  game: GameId
  filter: GalleryFilter
  page_size: number
  has_more: boolean
  events: GalleryFeedEvent[]
  next_cursor: GalleryCursor | null
  newest_event: GalleryCursor | null
  code?: string
  message?: string
}

export interface GalleryUnreadState {
  ok: boolean
  game: GameId
  has_unread: boolean
  latest_other_event_id: string | null
  latest_other_created_at_utc: string | null
}
