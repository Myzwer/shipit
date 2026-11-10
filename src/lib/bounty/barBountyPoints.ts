/**
 * Client-side provisional Bar Bounty bands (mirrors drinkit_bar_crew_points).
 * Server preview / submit remain authoritative.
 */
export type BarCrewSize = 3 | 4
export type BarBountyPoints = 0 | 20 | 30 | 40

/** presentCount includes the claimant (1 + selected assigned mates). */
export function provisionalBarCrewPoints(
  crewSize: BarCrewSize | number | null | undefined,
  presentCount: number,
): BarBountyPoints {
  if (crewSize !== 3 && crewSize !== 4) return 0
  if (presentCount < 2) return 0
  if (crewSize === 3) {
    if (presentCount >= 3) return 40
    if (presentCount === 2) return 20
    return 0
  }
  if (presentCount >= 4) return 40
  if (presentCount === 3) return 30
  if (presentCount === 2) return 20
  return 0
}

export function pointsFromSelectedMates(
  crewSize: BarCrewSize | number | null | undefined,
  selectedMateCount: number,
): BarBountyPoints {
  return provisionalBarCrewPoints(crewSize, 1 + Math.max(0, selectedMateCount))
}
