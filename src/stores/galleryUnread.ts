import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchGalleryUnread } from '@/lib/gallery/api'
import type { GameId } from '@/types/game'

export const useGalleryUnreadStore = defineStore('galleryUnread', () => {
  const drinkitUnread = ref(false)
  const shipitUnread = ref(false)
  const loading = ref(false)

  async function refresh(game?: GameId) {
    loading.value = true
    try {
      if (!game || game === 'drinkit') {
        try {
          const d = await fetchGalleryUnread('drinkit')
          drinkitUnread.value = !!d.has_unread
        } catch {
          /* preserve prior */
        }
      }
      if (!game || game === 'shipit') {
        try {
          const s = await fetchGalleryUnread('shipit')
          shipitUnread.value = !!s.has_unread
        } catch {
          /* preserve prior */
        }
      }
    } finally {
      loading.value = false
    }
  }

  function setUnread(game: GameId, value: boolean) {
    if (game === 'drinkit') drinkitUnread.value = value
    else shipitUnread.value = value
  }

  function hasUnread(game: GameId) {
    return game === 'drinkit' ? drinkitUnread.value : shipitUnread.value
  }

  return {
    drinkitUnread,
    shipitUnread,
    loading,
    refresh,
    setUnread,
    hasUnread,
  }
})
