import type { MockBountyCard, MockLeaderboardRow } from '@/types/game'
import { copy } from '@/ui/copy'

/** Local layout-only fixtures. Not production content. */
export const drinkItMockBounties: MockBountyCard[] = [
  {
    id: 'cocktail',
    heading: copy.bounty.cocktail,
    tierOrEyebrow: 'Familiar',
    title: 'Demo Cocktail',
    detail: 'Layout sample ingredients · Location: Demo Bar',
    pointsLabel: '25 Points',
    footer: 'Cocktail Bounty',
    timerLabel: copy.bounty.timeRemaining,
    timerValue: '36:45',
  },
  {
    id: 'ingredient',
    heading: copy.bounty.ingredient,
    tierOrEyebrow: 'Less Common',
    title: 'Demo Ingredient',
    detail: 'Available at 5 bars',
    pointsLabel: '50 Points',
    footer: 'Ingredient Bounty',
    timerLabel: copy.bounty.timeRemaining,
    timerValue: '1:12:08',
  },
  {
    id: 'bar',
    heading: copy.bounty.bar,
    tierOrEyebrow: '+10 Per Friend You Bring',
    title: 'Demo Featured Bar',
    detail: 'Order an alcoholic drink with Drink It! friends',
    pointsLabel: '35–95 Points',
    footer: 'Bar Bounty',
    timerLabel: 'Available until',
    timerValue: '11:00 PM',
  },
  {
    id: 'daily',
    heading: copy.bounty.daily,
    tierOrEyebrow: 'Party time!',
    title: 'Demo Daily Challenge',
    detail: 'Placeholder activity copy for layout only',
    pointsLabel: '50 Points',
    footer: 'Daily Challenge',
    timerLabel: 'Available until',
    timerValue: '11:00 PM',
  },
]

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
