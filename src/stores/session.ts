import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { GameId } from '@/types/game'

/**
 * Phase 0 presentation-only session.
 * Real authentication and memberships arrive in Phase 1.
 */
export const useSessionStore = defineStore('session', () => {
  const displayName = ref('Demo Organizer')
  const enrolledGames = ref<GameId[]>(['drinkit', 'shipit'])
  const currentGame = ref<GameId | null>(null)

  const isDualGame = computed(() => enrolledGames.value.length === 2)

  function setCurrentGame(game: GameId | null) {
    currentGame.value = game
  }

  return {
    displayName,
    enrolledGames,
    currentGame,
    isDualGame,
    setCurrentGame,
  }
})
