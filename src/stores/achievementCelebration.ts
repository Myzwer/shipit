import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameId } from '@/types/game'
import type { AchievementCard } from '@/types/achievements'
import { listAchievements } from '@/lib/achievements/api'
import {
  markSubmissionCelebrated,
  wasSubmissionCelebrated,
} from '@/lib/achievements/celebrationMemory'

export interface PendingAchievementCelebration {
  game: GameId
  submissionId: string
  awardIds: string[]
}

/**
 * Queues unlock celebrations after a confirmed submission receipt.
 * Dismissal does not clear achievement unread.
 */
export const useAchievementCelebrationStore = defineStore('achievementCelebration', () => {
  const pending = ref<PendingAchievementCelebration | null>(null)
  const visibleCards = ref<AchievementCard[]>([])
  const open = ref(false)
  const loading = ref(false)

  function queueFromSubmit(opts: {
    game: GameId
    submissionId?: string | null
    awardIds?: unknown
    idempotentReplay?: boolean
  }) {
    const submissionId = opts.submissionId
    if (!submissionId) return
    if (wasSubmissionCelebrated(submissionId)) return

    const awardIds = Array.isArray(opts.awardIds)
      ? opts.awardIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    if (awardIds.length === 0) return

    // Idempotent replay still celebrates once if the first response was lost
    // before the popup was shown (submission not yet marked celebrated).
    pending.value = {
      game: opts.game,
      submissionId,
      awardIds: [...new Set(awardIds)],
    }
  }

  async function presentIfPending() {
    if (!pending.value || open.value) return
    const job = pending.value
    if (wasSubmissionCelebrated(job.submissionId)) {
      pending.value = null
      return
    }
    loading.value = true
    try {
      const list = await listAchievements(job.game, 'mine')
      const wanted = new Set(job.awardIds)
      const cards = list.achievements.filter(
        (a) => a.earned && a.award_id && wanted.has(a.award_id),
      )
      if (cards.length === 0) {
        // Awards may be test-only outside development, or already revoked.
        markSubmissionCelebrated(job.submissionId)
        pending.value = null
        return
      }
      visibleCards.value = cards
      open.value = true
      markSubmissionCelebrated(job.submissionId)
    } finally {
      loading.value = false
    }
  }

  function dismiss() {
    open.value = false
    visibleCards.value = []
    pending.value = null
  }

  return {
    pending,
    visibleCards,
    open,
    loading,
    queueFromSubmit,
    presentIfPending,
    dismiss,
  }
})
