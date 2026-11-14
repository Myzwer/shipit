import type { GameId } from '@/types/game'
import type { GalleryFeedEvent } from '@/types/gallery'

const PAGE_SIZE = 5

export function galleryAchievementPrefKey(game: GameId) {
  return `gallery-show-achievements:${game}`
}

/** Missing preference means achievements stay visible. */
export function readShowAchievements(game: GameId): boolean {
  try {
    return localStorage.getItem(galleryAchievementPrefKey(game)) !== '0'
  } catch {
    return true
  }
}

export function writeShowAchievements(game: GameId, show: boolean) {
  try {
    localStorage.setItem(galleryAchievementPrefKey(game), show ? '1' : '0')
  } catch {
    /* Storage can be unavailable in private mode. The in-memory toggle still works. */
  }
}

export function visibleGalleryEvents(events: GalleryFeedEvent[], showAchievements: boolean) {
  if (showAchievements) return events
  return events.filter((event) => event.kind !== 'achievement')
}

/**
 * Hiding achievements must not treat a short visible page as the end of the feed
 * while later pages may still contain ordinary posts.
 */
export function galleryNeedsAnotherPage(opts: {
  showAchievements: boolean
  visibleCount: number
  hasMore: boolean
  pageSize?: number
}) {
  const pageSize = opts.pageSize ?? PAGE_SIZE
  return !opts.showAchievements && opts.hasMore && opts.visibleCount < pageSize
}
