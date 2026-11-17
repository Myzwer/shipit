/**
 * Phase 2C.11 — Friends-step Bar Bounty chrome visibility (presentation only).
 * Show crew grouping / reminder / points banner only when logging at today's
 * featured Bar Bounty bar and the player has not already claimed it.
 */
import type { BarBountyPreviewResult } from '@/types/barBountyPreview'

export function computeShowBarBountyFriendsUi(input: {
  showBarReminder: boolean
  selectedBarCanonicalKey: string | null | undefined
  preview: Pick<
    BarBountyPreviewResult,
    'already_claimed' | 'status' | 'reason' | 'claimable' | 'featured_bar_key'
  > | null
}): boolean {
  const server = input.preview
  if (server?.already_claimed || server?.status === 'already_claimed') return false
  if (server?.reason === 'not_featured_bar') return false

  // drinkit_bar_bounty_reminder: featured bar + unclaimed + active (canonical key match).
  if (input.showBarReminder) return true

  // Preview fallback when reminder lagged/failed: claimable only at today's featured bar.
  if (!input.selectedBarCanonicalKey) return false
  if (server?.claimable === true) return true
  if (server?.status === 'eligible') return true
  const featuredKey = server?.featured_bar_key
  if (typeof featuredKey === 'string' && featuredKey.length > 0) {
    return featuredKey === input.selectedBarCanonicalKey
  }
  return false
}
