import { listGalleryFeed } from '@/lib/gallery/api'
import type {
  GalleryCursor,
  GalleryEventKind,
  GalleryFeedEvent,
  GalleryReactionCounts,
} from '@/types/gallery'
import type { GameId } from '@/types/game'
import type { WrappedEntryPhoto } from '@/types/wrapped'

/** Server clamps list_gallery_feed to 20 rows per page. */
export const GALLERY_PAGE_SIZE = 20
export const GALLERY_EVENT_CAP = 200

export interface WrappedPhotoHighlight {
  photo: WrappedEntryPhoto
  caption: string | null
  eventId: string
  kind: GalleryEventKind
  createdAtUtc: string
  reactions: GalleryReactionCounts
  ownerTeamId: string | null
  challengeId: string | null
  challengeTitle: string | null
}

export type ReactionKey = keyof GalleryReactionCounts

export interface GalleryEventsResult {
  events: GalleryFeedEvent[]
  /** True when the cap stopped paging while the feed still had older events. */
  truncated: boolean
}

export async function fetchGalleryEventsWithMeta(
  game: GameId,
  cap: number = GALLERY_EVENT_CAP,
): Promise<GalleryEventsResult> {
  const events: GalleryFeedEvent[] = []
  let before: GalleryCursor | null = null
  let truncated = false

  while (true) {
    const page = await listGalleryFeed({
      game,
      filter: 'everyone',
      limit: GALLERY_PAGE_SIZE,
      before,
    })
    events.push(...page.events)
    if (!page.has_more || !page.next_cursor) break
    if (events.length >= cap) {
      truncated = true
      break
    }
    before = page.next_cursor
  }

  return { events: events.slice(0, cap), truncated }
}

export async function fetchAllGalleryEvents(
  game: GameId,
  cap: number = GALLERY_EVENT_CAP,
): Promise<GalleryFeedEvent[]> {
  return (await fetchGalleryEventsWithMeta(game, cap)).events
}

function displayString(display: Record<string, unknown>, key: string): string | null {
  const value = display?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export function toPhotoHighlight(event: GalleryFeedEvent): WrappedPhotoHighlight | null {
  if (!event.photo_id || event.kind === 'achievement') return null

  const framing = event.photo_framing ?? null
  const caption = event.caption?.trim()
  const display = event.display ?? {}

  return {
    photo: {
      photo_id: event.photo_id,
      width: event.photo_width ?? null,
      height: event.photo_height ?? null,
      crop_zoom: framing?.zoom ?? null,
      crop_center_x: framing?.center_x ?? null,
      crop_center_y: framing?.center_y ?? null,
    },
    caption: caption ? caption : null,
    eventId: event.event_id,
    kind: event.kind,
    createdAtUtc: event.created_at_utc,
    reactions: {
      heart: event.reactions?.heart ?? 0,
      laugh: event.reactions?.laugh ?? 0,
      hang_loose: event.reactions?.hang_loose ?? 0,
    },
    ownerTeamId: event.owner_team_id ?? null,
    challengeId: displayString(display, 'challenge_id'),
    challengeTitle: displayString(display, 'title'),
  }
}

export function buildPhotoHighlights(events: GalleryFeedEvent[]): WrappedPhotoHighlight[] {
  const out: WrappedPhotoHighlight[] = []
  for (const event of events) {
    const highlight = toPhotoHighlight(event)
    if (highlight) out.push(highlight)
  }
  return out
}

export async function fetchPhotoHighlights(
  game: GameId,
): Promise<{ highlights: WrappedPhotoHighlight[]; truncated: boolean }> {
  const { events, truncated } = await fetchGalleryEventsWithMeta(game)
  return { highlights: buildPhotoHighlights(events), truncated }
}

function createdMs(h: WrappedPhotoHighlight): number {
  const ms = Date.parse(h.createdAtUtc)
  return Number.isNaN(ms) ? 0 : ms
}

function compareNewestFirst(a: WrappedPhotoHighlight, b: WrappedPhotoHighlight): number {
  const diff = createdMs(b) - createdMs(a)
  if (diff !== 0) return diff
  return a.eventId.localeCompare(b.eventId)
}

export function totalReactions(h: WrappedPhotoHighlight): number {
  return h.reactions.heart + h.reactions.laugh + h.reactions.hang_loose
}

function rankByCount(
  highlights: WrappedPhotoHighlight[],
  count: (h: WrappedPhotoHighlight) => number,
): WrappedPhotoHighlight[] {
  return highlights
    .filter((h) => count(h) > 0)
    .sort((a, b) => count(b) - count(a) || compareNewestFirst(a, b))
}

export function byReaction(
  highlights: WrappedPhotoHighlight[],
  key: ReactionKey,
): WrappedPhotoHighlight[] {
  return rankByCount(highlights, (h) => h.reactions[key])
}

export function byLaugh(highlights: WrappedPhotoHighlight[]): WrappedPhotoHighlight[] {
  return byReaction(highlights, 'laugh')
}

export function byHeart(highlights: WrappedPhotoHighlight[]): WrappedPhotoHighlight[] {
  return byReaction(highlights, 'heart')
}

export function byHangLoose(highlights: WrappedPhotoHighlight[]): WrappedPhotoHighlight[] {
  return byReaction(highlights, 'hang_loose')
}

export function byTotalReactions(highlights: WrappedPhotoHighlight[]): WrappedPhotoHighlight[] {
  return rankByCount(highlights, totalReactions)
}

export function byEarliest(highlights: WrappedPhotoHighlight[]): WrappedPhotoHighlight[] {
  return [...highlights].sort(
    (a, b) => createdMs(a) - createdMs(b) || a.eventId.localeCompare(b.eventId),
  )
}

export function byNewest(highlights: WrappedPhotoHighlight[]): WrappedPhotoHighlight[] {
  return [...highlights].sort(compareNewestFirst)
}

export function pickDistinctPhotos(
  ranked: WrappedPhotoHighlight[],
  count: number,
): WrappedPhotoHighlight[] {
  const seen = new Set<string>()
  const out: WrappedPhotoHighlight[] = []
  for (const h of ranked) {
    if (out.length >= count) break
    if (seen.has(h.photo.photo_id)) continue
    seen.add(h.photo.photo_id)
    out.push(h)
  }
  return out
}
