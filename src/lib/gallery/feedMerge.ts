import type { GalleryFeedEvent, GalleryFeedPage } from '@/types/gallery'

/** Merge a fresh first-page response into already-loaded posts without dropping older pages. */
export function mergeGalleryFreshPage(
  existing: GalleryFeedEvent[],
  page: Pick<GalleryFeedPage, 'events'>,
): GalleryFeedEvent[] {
  const byId = new Map(existing.map((e) => [e.event_id, e]))
  const merged: GalleryFeedEvent[] = []
  const seen = new Set<string>()

  for (const ev of page.events) {
    seen.add(ev.event_id)
    const prev = byId.get(ev.event_id)
    if (prev) {
      merged.push({
        ...prev,
        ...ev,
        reactions: ev.reactions,
        my_reaction: ev.my_reaction,
      })
    } else {
      merged.push(ev)
    }
  }

  for (const ev of existing) {
    if (!seen.has(ev.event_id)) merged.push(ev)
  }

  return merged
}

/**
 * Count how many leading page events are newer than the currently loaded top.
 * Returns exact:false when the old top is not found in the page (possible undercount).
 */
export function countNewerThanTop(
  pageEvents: GalleryFeedEvent[],
  topEventId: string | undefined,
): { count: number; exact: boolean } {
  if (!topEventId) {
    return { count: pageEvents.length, exact: true }
  }
  let count = 0
  for (const ev of pageEvents) {
    if (ev.event_id === topEventId) {
      return { count, exact: true }
    }
    count += 1
  }
  return { count: pageEvents.length, exact: false }
}
