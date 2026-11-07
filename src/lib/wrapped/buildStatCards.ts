import type {
  DrinkItPersonalStats,
  ShipItTeamStats,
  WrappedStatCard,
} from '@/types/wrapped'

/**
 * Factual personal/team cards for Wrapped.
 * Creative superlative names / quips are later content — keep labels neutral.
 */
export function buildDrinkItStatCards(stats: DrinkItPersonalStats): WrappedStatCard[] {
  return [
    {
      kind: 'number',
      key: 'final_points',
      icon: 'score.leaderboard',
      value: String(stats.final_points),
      label: 'Final points',
      copy: 'From active bounty claims.',
      tone: 'aqua',
    },
    {
      kind: 'number',
      key: 'drink_logs',
      icon: 'theme.drink-it',
      value: String(stats.drink_logs),
      label: 'Drink logs',
      copy: 'Valid accepted drink logs.',
      tone: 'cream',
    },
    {
      kind: 'number',
      key: 'distinct_bars',
      icon: 'score.bar',
      value: String(stats.distinct_bars),
      label: 'Bars visited',
      copy: 'Distinct game bars logged.',
      tone: 'cream',
    },
    {
      kind: 'number',
      key: 'named_cocktails',
      icon: 'theme.drink-it',
      value: String(stats.distinct_named_cocktails),
      label: 'Named cocktails',
      copy: 'Distinct catalog drinks logged.',
      tone: 'aqua',
    },
    {
      kind: 'named',
      key: 'bounty_breakdown',
      icon: 'score.medal',
      chip: 'Bounty claims',
      value: String(stats.bounty_claims_total),
      label: `C ${stats.bounty_claims_by_category.cocktail} · I ${stats.bounty_claims_by_category.ingredient} · B ${stats.bounty_claims_by_category.bar} · D ${stats.bounty_claims_by_category.daily}`,
      copy: 'Active claims by category.',
      tone: 'aqua',
    },
    {
      kind: 'number',
      key: 'daily_completions',
      icon: 'score.calendar',
      value: String(stats.daily_completions),
      label: 'Daily challenges',
      copy: 'Accepted Daily completions.',
      tone: 'cream',
    },
    {
      kind: 'number',
      key: 'achievements',
      icon: 'score.achievement',
      value: String(stats.achievements_earned),
      label: 'Achievements',
      copy: 'Active earned awards.',
      tone: 'aqua',
    },
    {
      kind: 'number',
      key: 'companions',
      icon: 'score.friends',
      value: String(stats.distinct_companions),
      label: 'Companions',
      copy: 'Distinct companions selected on logs.',
      tone: 'cream',
    },
  ]
}

export function buildShipItStatCards(stats: ShipItTeamStats): WrappedStatCard[] {
  return [
    {
      kind: 'number',
      key: 'final_points',
      icon: 'score.leaderboard',
      value: String(stats.final_points),
      label: 'Team points',
      copy: 'From active challenge completions.',
      tone: 'aqua',
    },
    {
      kind: 'number',
      key: 'challenges',
      icon: 'score.team',
      value: `${stats.challenges_completed}/${stats.challenges_total}`,
      label: 'Challenges completed',
      copy: 'Team completions this cruise.',
      tone: 'cream',
    },
    {
      kind: 'number',
      key: 'categories',
      icon: 'score.medal',
      value: String(stats.distinct_categories),
      label: 'Categories touched',
      copy: 'Distinct challenge categories.',
      tone: 'cream',
    },
    {
      kind: 'number',
      key: 'achievements',
      icon: 'score.achievement',
      value: String(stats.achievements_earned),
      label: 'Team achievements',
      copy: 'Active earned team awards.',
      tone: 'aqua',
    },
  ]
}
