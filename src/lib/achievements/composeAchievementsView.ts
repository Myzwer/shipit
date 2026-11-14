/**
 * Presentation composition for Drink It! / Ship It! Achievements lists.
 * Gauntlet trackers are UI-only and never count toward achievement totals.
 */
import type {
  AchievementCard,
  AchievementCategoryMeta,
  AchievementGroup,
  BarGauntletSummary,
} from '@/types/achievements'
import { achievementCategoriesOrdered, categoryMetaForGroup } from './categories'

export type AchievementsFilterKey = 'all' | string

export type GauntletPresentationState =
  | 'neither'
  | 'team_only'
  | 'both'
  | 'solo_without_team'

export function gauntletPresentationState(
  summary: BarGauntletSummary,
): GauntletPresentationState {
  const team = summary.collective.earned || summary.collective.badge_earned
  const solo = summary.personal.earned || summary.personal.badge_earned
  if (team && solo) return 'both'
  if (team && !solo) return 'team_only'
  if (!team && solo) return 'solo_without_team'
  return 'neither'
}

export type AchievementSectionItem =
  | { kind: 'card'; card: AchievementCard }
  | { kind: 'gauntlet_tracker'; summary: BarGauntletSummary }

export interface AchievementSection {
  key: string
  label: string
  group_key: AchievementGroup | string
  earned: number
  total: number
  items: AchievementSectionItem[]
  /** Nested bar groups only for Bar Gauntlets in All view. */
  children?: Array<{
    key: string
    label: string
    items: AchievementSectionItem[]
  }>
}

export function overallAchievementCounts(cards: AchievementCard[]): {
  earned: number
  total: number
} {
  const total = cards.length
  const earned = cards.filter((c) => c.earned).length
  return { earned, total }
}

export function categoryCounts(
  cards: AchievementCard[],
  groupKey: string,
): { earned: number; total: number } {
  const inCat = cards.filter((c) => c.group_key === groupKey)
  return {
    earned: inCat.filter((c) => c.earned).length,
    total: inCat.length,
  }
}

function orderedCategoriesForGame(
  cards: AchievementCard[],
  categories: AchievementCategoryMeta[] = achievementCategoriesOrdered(),
): AchievementCategoryMeta[] {
  const present = new Set(cards.map((c) => c.group_key))
  const game = cards[0]?.game
  const scoped = categories.filter((c) => {
    if (!present.has(c.group_key)) return false
    if (!c.games || !game) return true
    return c.games.includes(game)
  })
  // Include any unexpected group_keys after known categories.
  for (const key of present) {
    if (!scoped.some((c) => c.group_key === key)) {
      const meta = categoryMetaForGroup(key)
      scoped.push(
        meta ?? {
          key,
          name: key,
          group_key: key as AchievementGroup,
          all_view_order: 50,
        },
      )
    }
  }
  return scoped.sort((a, b) => a.all_view_order - b.all_view_order)
}

function gauntletCardsByBar(cards: AchievementCard[]): Map<string, AchievementCard[]> {
  const map = new Map<string, AchievementCard[]>()
  for (const card of cards) {
    if (card.group_key !== 'bar_gauntlets') continue
    const barKey = card.collection?.bar_key
    if (!barKey) continue
    const list = map.get(barKey) ?? []
    list.push(card)
    map.set(barKey, list)
  }
  return map
}

/**
 * Build All-view sections. Bar Gauntlets nest by bar and inject trackers per state.
 */
export function composeAllSections(opts: {
  cards: AchievementCard[]
  gauntlets: BarGauntletSummary[]
  filter: AchievementsFilterKey
  categories?: AchievementCategoryMeta[]
  onAnomaly?: (message: string, detail?: unknown) => void
}): AchievementSection[] {
  const categories = orderedCategoriesForGame(opts.cards, opts.categories)
  const filteredCats =
    opts.filter === 'all'
      ? categories
      : categories.filter((c) => c.key === opts.filter || c.group_key === opts.filter)

  const sections: AchievementSection[] = []

  for (const cat of filteredCats) {
    const counts = categoryCounts(opts.cards, cat.group_key)
    if (counts.total === 0) continue

    if (cat.group_key === 'bar_gauntlets' && cat.organize_children_by === 'bar_key') {
      const byBar = gauntletCardsByBar(opts.cards)
      const children: NonNullable<AchievementSection['children']> = []
      const barOrder = opts.gauntlets.length
        ? opts.gauntlets
        : [...byBar.keys()].map(
            (bar_key) =>
              ({
                bar_key,
                bar_name: bar_key,
                live_target: 0,
                verification_pending: bar_key === 'good-spirits-at-sea',
                personal: {
                  definition_id: '',
                  stable_key: '',
                  earned: false,
                  badge_earned: false,
                  live_current: 0,
                  live_target: 0,
                  pin_target: null,
                  icon_key: null,
                },
                collective: {
                  definition_id: '',
                  stable_key: '',
                  earned: false,
                  badge_earned: false,
                  live_current: 0,
                  live_target: 0,
                  pin_target: null,
                  icon_key: null,
                },
              }) satisfies BarGauntletSummary,
          )

      // Non-bar collection cards (Frozen Concoctions / License to Chill) render first.
      const collectionCards = opts.cards.filter(
        (c) =>
          c.group_key === 'bar_gauntlets' &&
          !c.collection?.bar_key &&
          !c.stable_key.includes('-gauntlet-'),
      )
      const topItems: AchievementSectionItem[] = collectionCards.map((card) => ({
        kind: 'card' as const,
        card,
      }))

      for (const summary of barOrder) {
        const state = gauntletPresentationState(summary)
        if (state === 'solo_without_team') {
          opts.onAnomaly?.('Gauntlet solo earned without team', {
            bar_key: summary.bar_key,
          })
        }
        const barCards = byBar.get(summary.bar_key) ?? []
        const items: AchievementSectionItem[] = []

        const collectiveCard = barCards.find(
          (c) =>
            c.collection?.scope === 'collective' ||
            c.stable_key.includes('-collective-') ||
            c.stable_key === summary.collective.stable_key,
        )
        const personalCard = barCards.find(
          (c) =>
            c.collection?.scope === 'personal' ||
            c.stable_key.includes('-personal-') ||
            c.stable_key === summary.personal.stable_key,
        )

        if (summary.verification_pending && state === 'neither') {
          items.push({ kind: 'gauntlet_tracker', summary })
        } else if (state === 'both') {
          if (collectiveCard?.earned) items.push({ kind: 'card', card: collectiveCard })
          if (personalCard?.earned) items.push({ kind: 'card', card: personalCard })
        } else if (state === 'team_only') {
          if (collectiveCard?.earned) items.push({ kind: 'card', card: collectiveCard })
          items.push({ kind: 'gauntlet_tracker', summary })
        } else if (state === 'solo_without_team') {
          if (personalCard?.earned) items.push({ kind: 'card', card: personalCard })
          items.push({ kind: 'gauntlet_tracker', summary })
        } else {
          items.push({ kind: 'gauntlet_tracker', summary })
        }

        children.push({
          key: summary.bar_key,
          label: summary.verification_pending
            ? `${summary.bar_name} (verification pending)`
            : summary.bar_name,
          items,
        })
      }

      sections.push({
        key: cat.key,
        label: cat.name,
        group_key: cat.group_key,
        earned: counts.earned,
        total: counts.total,
        items: topItems,
        children,
      })
      continue
    }

    const items: AchievementSectionItem[] = opts.cards
      .filter((c) => c.group_key === cat.group_key)
      .map((card) => ({ kind: 'card' as const, card }))

    sections.push({
      key: cat.key,
      label: cat.name,
      group_key: cat.group_key,
      earned: counts.earned,
      total: counts.total,
      items,
    })
  }

  return sections
}

/** My Achievements: earned cards only, grouped by category order. No trackers. */
export function composeMineSections(opts: {
  cards: AchievementCard[]
  filter: AchievementsFilterKey
  categories?: AchievementCategoryMeta[]
  /** Award IDs temporarily lifted into Just Unlocked (omit from category lists). */
  excludeAwardIds?: ReadonlySet<string>
}): AchievementSection[] {
  const exclude = opts.excludeAwardIds
  const earned = opts.cards.filter(
    (c) => c.earned && !(exclude && c.award_id && exclude.has(c.award_id)),
  )
  const categories = orderedCategoriesForGame(opts.cards, opts.categories)
  const filteredCats =
    opts.filter === 'all'
      ? categories
      : categories.filter((c) => c.key === opts.filter || c.group_key === opts.filter)

  const sections: AchievementSection[] = []
  for (const cat of filteredCats) {
    const counts = categoryCounts(opts.cards, cat.group_key)
    const items: AchievementSectionItem[] = earned
      .filter((c) => c.group_key === cat.group_key)
      .map((card) => ({ kind: 'card' as const, card }))
    if (items.length === 0) continue
    sections.push({
      key: cat.key,
      label: cat.name,
      group_key: cat.group_key,
      earned: counts.earned,
      total: counts.total,
      items,
    })
  }
  return sections
}
