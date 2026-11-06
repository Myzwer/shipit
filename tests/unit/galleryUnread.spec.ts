import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/lib/gallery/api', () => ({
  fetchGalleryUnread: vi.fn(async (game: string) => ({
    ok: true,
    game,
    has_unread: game === 'drinkit',
    latest_other_event_id: null,
    latest_other_created_at_utc: null,
  })),
}))

import { useGalleryUnreadStore } from '@/stores/galleryUnread'

describe('galleryUnread store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps Drink It! and Ship It! unread independent', async () => {
    const store = useGalleryUnreadStore()
    await store.refresh()
    expect(store.drinkitUnread).toBe(true)
    expect(store.shipitUnread).toBe(false)
    store.setUnread('shipit', true)
    expect(store.hasUnread('shipit')).toBe(true)
    expect(store.hasUnread('drinkit')).toBe(true)
  })
})
