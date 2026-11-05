import type { MockLeaderboardRow } from '@/types/game'
import type { HomeBountyCardView } from '@/types/bountyHome'
import { copy, formatCopy } from '@/ui/copy'

/**
 * Layout-only leaderboard fixtures until standings RPC exists.
 * Not production content.
 */
export const drinkItMockLeaderboard: MockLeaderboardRow[] = [
  {
    id: 'p1',
    rank: 1,
    name: 'Demo Player A',
    metricLabel: 'Bounties 0/28',
    points: 0,
  },
  {
    id: 'p2',
    rank: 2,
    name: 'Demo Player B',
    metricLabel: 'Bounties 0/28',
    points: 0,
  },
  {
    id: 'p3',
    rank: 3,
    name: 'Demo Player C',
    metricLabel: 'Bounties 0/28',
    points: 0,
  },
]

/**
 * Explicit visual-test fixtures for component screenshots.
 * These are NOT used by DrinkItHomeView in normal app mode.
 * Label any screenshot captured from these as MOCKED.
 */
export const visualFixtureActiveCards: HomeBountyCardView[] = [
  {
    id: 'cocktail',
    heading: copy.bounty.cocktail,
    presentation: 'active',
    tierOrEyebrow: 'Familiar',
    title: 'Fixture Spritz',
    detail: `Prosecco · Aperol · soda · ${formatCopy(copy.bounty.location, { barName: 'Fixture Piazza' })}`,
    pointsLabel: '25 Points',
    footer: copy.bounty.cocktail,
    timerLabel: copy.bounty.timeRemaining,
    timerValue: '36:45',
    claimEnabled: false,
    claimTitle: 'Visual fixture — Claim It disabled',
  },
  {
    id: 'ingredient',
    heading: copy.bounty.ingredient,
    presentation: 'active',
    tierOrEyebrow: 'Less Common',
    title: 'Fixture Orgeat',
    detail: formatCopy(copy.bounty.availableAt, { barCount: 5, barOrBars: 'bars' }),
    pointsLabel: '50 Points',
    footer: copy.bounty.ingredient,
    timerLabel: copy.bounty.timeRemaining,
    timerValue: '1:12:08',
    claimEnabled: false,
    claimTitle: 'Visual fixture — Claim It disabled',
  },
  {
    id: 'bar',
    heading: copy.bounty.bar,
    presentation: 'shell',
    tierOrEyebrow: '+10 Per Friend You Bring',
    title: 'Featured Bar',
    detail: 'Daily Bar Bounty wiring arrives in Phase 2D-B2.',
    pointsLabel: '35–95 Points',
    footer: copy.bounty.bar,
    timerLabel: copy.bounty.availableUntil,
    timerValue: '—',
    claimEnabled: false,
    claimTitle: 'Visual fixture — Claim It disabled',
  },
  {
    id: 'daily',
    heading: copy.bounty.daily,
    presentation: 'shell',
    tierOrEyebrow: 'Coming soon',
    title: 'Daily Challenge',
    detail: 'Daily Challenge wiring arrives in Phase 2D-B2.',
    pointsLabel: '50 Points',
    footer: copy.bounty.daily,
    timerLabel: copy.bounty.availableUntil,
    timerValue: '—',
    claimEnabled: false,
    claimTitle: 'Visual fixture — Claim It disabled',
  },
]

export const visualFixtureClosedCards: HomeBountyCardView[] = (
  ['cocktail', 'ingredient', 'bar', 'daily'] as const
).map((id) => ({
  id,
  heading:
    id === 'cocktail'
      ? copy.bounty.cocktail
      : id === 'ingredient'
        ? copy.bounty.ingredient
        : id === 'bar'
          ? copy.bounty.bar
          : copy.bounty.daily,
  presentation: 'closed' as const,
  tierOrEyebrow: '',
  title: copy.bounty.seeYouTomorrow,
  detail: copy.bounty.overnightDetail,
  pointsLabel: '',
  footer:
    id === 'cocktail'
      ? copy.bounty.cocktail
      : id === 'ingredient'
        ? copy.bounty.ingredient
        : id === 'bar'
          ? copy.bounty.bar
          : copy.bounty.daily,
  timerLabel: copy.bounty.opensIn,
  timerValue: '10:00:00',
  claimEnabled: false as const,
  claimTitle: 'Visual fixture — Claim It disabled',
}))

export const visualFixturePausedCards: HomeBountyCardView[] = (
  ['cocktail', 'ingredient', 'bar', 'daily'] as const
).map((id) => ({
  id,
  heading:
    id === 'cocktail'
      ? copy.bounty.cocktail
      : id === 'ingredient'
        ? copy.bounty.ingredient
        : id === 'bar'
          ? copy.bounty.bar
          : copy.bounty.daily,
  presentation: 'paused' as const,
  tierOrEyebrow: '',
  title: copy.bounty.pausedTitle,
  detail: `${copy.bounty.pausedSecondary} ${copy.bounty.pausedOrganizerNote}`,
  pointsLabel: '',
  footer:
    id === 'cocktail'
      ? copy.bounty.cocktail
      : id === 'ingredient'
        ? copy.bounty.ingredient
        : id === 'bar'
          ? copy.bounty.bar
          : copy.bounty.daily,
  timerLabel: '',
  timerValue: '',
  claimEnabled: false as const,
  claimTitle: 'Visual fixture — Claim It disabled',
}))

export const visualFixtureFinaleCards: HomeBountyCardView[] = (
  ['cocktail', 'ingredient', 'bar', 'daily'] as const
).map((id) => ({
  id,
  heading:
    id === 'cocktail'
      ? copy.bounty.cocktail
      : id === 'ingredient'
        ? copy.bounty.ingredient
        : id === 'bar'
          ? copy.bounty.bar
          : copy.bounty.daily,
  presentation: 'finale' as const,
  tierOrEyebrow: '',
  title: copy.bounty.finaleTitle,
  detail: copy.bounty.finaleDetail,
  pointsLabel: '',
  footer:
    id === 'cocktail'
      ? copy.bounty.cocktail
      : id === 'ingredient'
        ? copy.bounty.ingredient
        : id === 'bar'
          ? copy.bounty.bar
          : copy.bounty.daily,
  timerLabel: '',
  timerValue: '',
  claimEnabled: false as const,
  claimTitle: 'Visual fixture — Claim It disabled',
}))
