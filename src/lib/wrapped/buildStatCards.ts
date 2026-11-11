import type {
  DrinkItPersonalStats,
  ShipItTeamStats,
  WrappedStatCard,
} from '@/types/wrapped'
import { buildPersonalCards } from '@/lib/wrapped/buildFinalCards'
import type { WrappedEntry } from '@/types/wrapped'

/**
 * Legacy Phase 8 card builder retained for unit tests / transitional callers.
 * Final UI uses buildPersonalCards() against sections.personal.
 */
export function buildDrinkItStatCards(stats: DrinkItPersonalStats): WrappedStatCard[] {
  const synthetic: WrappedEntry[] = [
    {
      spec_id: 'DI-P02',
      label: 'Total Points',
      available: true,
      kind: 'count',
      primary: String(stats.final_points),
      secondary: 'From active bounty claims.',
      value_numeric: stats.final_points,
      unit: 'points',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'DI-P01',
      label: 'Drinks Logged',
      available: true,
      kind: 'count',
      primary: String(stats.drink_logs),
      secondary: 'Valid accepted drink logs.',
      value_numeric: stats.drink_logs,
      unit: 'drinks',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'DI-P11',
      label: 'Bars Visited',
      available: true,
      kind: 'count',
      primary: String(stats.distinct_bars),
      secondary: 'Distinct game bars logged.',
      value_numeric: stats.distinct_bars,
      unit: 'bars',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'DI-P10',
      label: 'Different Drinks Tried',
      available: true,
      kind: 'count',
      primary: String(stats.distinct_named_cocktails),
      secondary: 'Distinct catalog drinks logged.',
      value_numeric: stats.distinct_named_cocktails,
      unit: 'drinks',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'DI-P05',
      label: 'Bounties Completed',
      available: true,
      kind: 'named_count',
      primary: String(stats.bounty_claims_total),
      secondary: `C ${stats.bounty_claims_by_category.cocktail} · I ${stats.bounty_claims_by_category.ingredient} · B ${stats.bounty_claims_by_category.bar} · D ${stats.bounty_claims_by_category.daily}`,
      value_numeric: stats.bounty_claims_total,
      unit: 'claims',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'DI-P09',
      label: 'Daily Challenges Completed',
      available: true,
      kind: 'count',
      primary: String(stats.daily_completions),
      secondary: 'Accepted Daily completions.',
      value_numeric: stats.daily_completions,
      unit: 'challenges',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'DI-P04',
      label: 'Achievements Unlocked',
      available: true,
      kind: 'count',
      primary: String(stats.achievements_earned),
      secondary: 'Active earned awards.',
      value_numeric: stats.achievements_earned,
      unit: 'achievements',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
  ]
  return buildPersonalCards(synthetic).map((card) => {
    // Preserve legacy test keys expected by buildStatCards.spec.ts
    if (card.key === 'DI-P02') return { ...card, key: 'final_points' }
    if (card.key === 'DI-P01') return { ...card, key: 'drink_logs' }
    if (card.key === 'DI-P11') return { ...card, key: 'distinct_bars' }
    if (card.key === 'DI-P10') return { ...card, key: 'named_cocktails' }
    if (card.key === 'DI-P05') return { ...card, key: 'bounty_breakdown', label: card.copy || card.label, copy: 'Active claims by category.' }
    if (card.key === 'DI-P09') return { ...card, key: 'daily_completions' }
    if (card.key === 'DI-P04') return { ...card, key: 'achievements' }
    return card
  })
}

export function buildShipItStatCards(stats: ShipItTeamStats): WrappedStatCard[] {
  const synthetic: WrappedEntry[] = [
    {
      spec_id: 'SI-P02',
      label: 'Total Points',
      available: true,
      kind: 'count',
      primary: String(stats.final_points),
      secondary: 'From active challenge completions.',
      value_numeric: stats.final_points,
      unit: 'points',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
    {
      spec_id: 'SI-P03',
      label: 'Challenges Completed',
      available: true,
      kind: 'count',
      primary: `${stats.challenges_completed}/${stats.challenges_total}`,
      secondary: 'Team completions this cruise.',
      value_numeric: stats.challenges_completed,
      unit: 'challenges',
      winners: [],
      items: [],
      photo: null,
      explanation: null,
      empty_reason: null,
    },
  ]
  return buildPersonalCards(synthetic).map((card) => {
    if (card.key === 'SI-P02') return { ...card, key: 'final_points' }
    if (card.key === 'SI-P03') return { ...card, key: 'challenges' }
    return card
  })
}
