import { describe, expect, it } from 'vitest'
import {
  galleryNeedsAnotherPage,
  visibleGalleryEvents,
} from '@/lib/gallery/achievementVisibility'
import type { GalleryFeedEvent } from '@/types/gallery'

function event(kind: GalleryFeedEvent['kind'], id: string): GalleryFeedEvent {
  return {
    event_id: id,
    kind,
    created_at_utc: '2026-11-08T12:00:00Z',
    created_ship_local: '2026-11-08T12:00:00',
    owner_player_id: null,
    owner_player_name: null,
    owner_team_id: null,
    owner_team_name: null,
    submission_id: null,
    caption: null,
    photo_id: null,
    display: {},
    reactions: { heart: 0, laugh: 0, hang_loose: 0 },
    my_reaction: null,
  }
}

describe('gallery achievement visibility', () => {
  const mixed = [
    event('achievement', 'a'),
    event('drink_log', 'b'),
    event('achievement', 'c'),
    event('scavenger', 'd'),
  ]

  it('keeps chronological order and every kind when achievements are shown', () => {
    expect(visibleGalleryEvents(mixed, true).map((row) => row.event_id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops only achievement announcements when hidden', () => {
    expect(visibleGalleryEvents(mixed, false).map((row) => row.event_id)).toEqual(['b', 'd'])
  })

  it('asks for another page when a hidden batch would otherwise look finished', () => {
    expect(
      galleryNeedsAnotherPage({ showAchievements: false, visibleCount: 0, hasMore: true }),
    ).toBe(true)
    expect(
      galleryNeedsAnotherPage({ showAchievements: false, visibleCount: 4, hasMore: true }),
    ).toBe(true)
  })

  it('stops when the visible page is full or the server has no more rows', () => {
    expect(
      galleryNeedsAnotherPage({ showAchievements: false, visibleCount: 5, hasMore: true }),
    ).toBe(false)
    expect(
      galleryNeedsAnotherPage({ showAchievements: false, visibleCount: 1, hasMore: false }),
    ).toBe(false)
    expect(
      galleryNeedsAnotherPage({ showAchievements: true, visibleCount: 0, hasMore: true }),
    ).toBe(false)
  })
})