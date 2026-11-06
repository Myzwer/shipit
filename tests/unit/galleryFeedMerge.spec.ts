import { describe, expect, it } from 'vitest'
import { countNewerThanTop, mergeGalleryFreshPage } from '@/lib/gallery/feedMerge'
import type { GalleryFeedEvent } from '@/types/gallery'

function ev(id: string, heart = 0): GalleryFeedEvent {
  return {
    event_id: id,
    kind: 'drink_log',
    created_at_utc: '2099-01-03T12:00:00Z',
    created_ship_local: '2099-01-03T17:00:00',
    owner_player_id: null,
    owner_player_name: null,
    owner_team_id: null,
    owner_team_name: null,
    submission_id: null,
    caption: null,
    photo_id: null,
    display: {},
    reactions: { heart, laugh: 0, hang_loose: 0 },
    my_reaction: null,
  }
}

describe('gallery feed merge', () => {
  it('prepends new posts and keeps older loaded pages', () => {
    const loaded = [ev('a'), ev('b'), ev('c'), ev('d'), ev('e'), ev('f'), ev('g')]
    const page = { events: [ev('n1'), ev('n2'), ev('a', 3), ev('b'), ev('c')] }
    const merged = mergeGalleryFreshPage(loaded, page)
    expect(merged.map((e) => e.event_id)).toEqual([
      'n1',
      'n2',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ])
    expect(merged.find((e) => e.event_id === 'a')?.reactions.heart).toBe(3)
  })

  it('marks undercount when old top is outside the polled page', () => {
    const page = [ev('n1'), ev('n2'), ev('n3'), ev('n4'), ev('n5')]
    expect(countNewerThanTop(page, 'old-top')).toEqual({ count: 5, exact: false })
    expect(countNewerThanTop(page, 'n3')).toEqual({ count: 2, exact: true })
  })
})
