import type { GalleryReactionEmoji } from '@/types/gallery'
import { copy } from '@/ui/copy'

export const REACTION_AUTHOR_ORDER: readonly GalleryReactionEmoji[] = [
  'heart',
  'laugh',
  'hang_loose',
] as const

export interface GalleryReactionAuthorGroup {
  emoji: GalleryReactionEmoji
  authors: string[]
}

export interface GalleryReactionAuthorsResult {
  ok: true
  event_id: string
  game?: string
  groups: GalleryReactionAuthorGroup[]
}

/** Modal section labels — Live/Laugh/Love joke; icons/keys stay heart/laugh/hang_loose. */
export function reactionAuthorGroupLabel(emoji: GalleryReactionEmoji): string {
  switch (emoji) {
    case 'heart':
      return copy.gallery.reactionGroupLove
    case 'laugh':
      return copy.gallery.reactionGroupLaugh
    case 'hang_loose':
      return copy.gallery.reactionGroupLive
    default:
      return emoji
  }
}

export function reactionAuthorGlyph(emoji: GalleryReactionEmoji): string {
  switch (emoji) {
    case 'heart':
      return '❤️'
    case 'laugh':
      return '😂'
    case 'hang_loose':
      return '🤙'
    default:
      return ''
  }
}

/** Normalize RPC payload: fixed order, unique names, alphabetized within each group. */
export function normalizeReactionAuthorGroups(
  raw: unknown,
): GalleryReactionAuthorGroup[] {
  const byEmoji = new Map<GalleryReactionEmoji, string[]>()
  const rows = Array.isArray(raw) ? raw : []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const emoji = (row as { emoji?: unknown }).emoji
    if (emoji !== 'heart' && emoji !== 'laugh' && emoji !== 'hang_loose') continue
    const authorsRaw = (row as { authors?: unknown }).authors
    const names = Array.isArray(authorsRaw)
      ? authorsRaw
          .filter((n): n is string => typeof n === 'string')
          .map((n) => n.trim())
          .filter(Boolean)
      : []
    const unique = [...new Set(names)]
    unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    byEmoji.set(emoji, unique)
  }
  return REACTION_AUTHOR_ORDER.map((emoji) => ({
    emoji,
    authors: byEmoji.get(emoji) ?? [],
  }))
}

export function reactionAuthorsAreEmpty(groups: GalleryReactionAuthorGroup[]): boolean {
  return groups.every((g) => g.authors.length === 0)
}
