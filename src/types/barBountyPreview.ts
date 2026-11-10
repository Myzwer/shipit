/**
 * Phase B2 Bar Bounty preview contract for B3 companion-selection UI.
 * Preview never awards points or creates claims.
 */

export type BarBountyPreviewResult = {
  ok: boolean
  awards_points: false
  creates_claim: false
  cruise_day?: number
  has_assigned_crew?: boolean
  crew_id?: string | null
  crew_size?: 3 | 4 | null
  qualifying_mate_count?: number
  present_count?: number
  claimable?: boolean
  already_claimed?: boolean
  /** Exact potential award: 0, 20, 30, or 40 */
  points?: 0 | 20 | 30 | 40
  status?: 'eligible' | 'unavailable' | 'already_claimed' | string
  reason?: string | null
  message?: string | null
  featured_bar_key?: string | null
  assignment_id?: string | null
  scoring?: 'b2-crew-v1'
  code?: string
}
