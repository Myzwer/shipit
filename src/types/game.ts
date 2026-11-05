export type GameId = 'drinkit' | 'shipit'

export type BountyCategory = 'cocktail' | 'ingredient' | 'bar' | 'daily'

export interface MockLeaderboardRow {
  id: string
  rank: number
  name: string
  members?: string[]
  metricLabel: string
  points: number
}

/** @deprecated Prefer HomeBountyCardView from bountyHome — retained for transitional typing. */
export interface MockBountyCard {
  id: BountyCategory
  heading: string
  tierOrEyebrow: string
  title: string
  detail: string
  pointsLabel: string
  footer: string
  timerLabel: string
  timerValue: string
}

export interface MockCategoryProgress {
  id: string
  label: string
  completed: number
  total: number
  points: number
}
