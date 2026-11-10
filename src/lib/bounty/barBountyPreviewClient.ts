/**
 * Debounced, generation-guarded Bar Bounty preview for the Friends step.
 * Cruise Wi-Fi friendly: coalesce rapid taps; ignore stale responses.
 */
import { previewMyBarBounty } from '@/lib/bounty/barBountyApi'
import type { BarBountyPreviewResult } from '@/types/barBountyPreview'

export type BarPreviewRequest = {
  barCanonicalKey: string
  companionIds: string[]
  drink?: Record<string, unknown>
}

export function createBarBountyPreviewClient(options?: {
  debounceMs?: number
  previewFn?: typeof previewMyBarBounty
}) {
  const debounceMs = options?.debounceMs ?? 280
  const previewFn = options?.previewFn ?? previewMyBarBounty

  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let queued: BarPreviewRequest | null = null

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function run(req: BarPreviewRequest, gen: number): Promise<BarBountyPreviewResult | null> {
    inFlight = true
    try {
      const result = await previewFn({
        bar_canonical_key: req.barCanonicalKey,
        companion_player_ids: req.companionIds,
        drink: req.drink,
      })
      if (gen !== generation) return null
      return result
    } finally {
      inFlight = false
      if (queued && gen === generation) {
        const next = queued
        queued = null
        void schedule(next)
      }
    }
  }

  function schedule(req: BarPreviewRequest): Promise<BarBountyPreviewResult | null> {
    const gen = ++generation
    clearTimer()
    return new Promise((resolve) => {
      timer = setTimeout(async () => {
        timer = null
        if (gen !== generation) {
          resolve(null)
          return
        }
        if (inFlight) {
          queued = req
          resolve(null)
          return
        }
        resolve(await run(req, gen))
      }, debounceMs)
    })
  }

  /** Immediate preview (no debounce) — still generation-guarded. */
  function previewNow(req: BarPreviewRequest): Promise<BarBountyPreviewResult | null> {
    const gen = ++generation
    clearTimer()
    queued = null
    return run(req, gen)
  }

  function cancel() {
    generation += 1
    clearTimer()
    queued = null
  }

  return {
    schedule,
    previewNow,
    cancel,
    get generation() {
      return generation
    },
  }
}
