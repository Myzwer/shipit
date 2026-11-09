import { describe, expect, it, vi } from 'vitest'
import {
  composeAllSections,
  composeMineSections,
  gauntletPresentationState,
  overallAchievementCounts,
} from '@/lib/achievements/composeAchievementsView'
import type { AchievementCard, BarGauntletSummary } from '@/types/achievements'

function card(partial: Partial<AchievementCard> & Pick<AchievementCard, 'stable_key' | 'group_key'>): AchievementCard {
  return {
    definition_id: partial.definition_id ?? partial.stable_key,
    stable_key: partial.stable_key,
    game: 'drinkit',
    group_key: partial.group_key,
    exclusive: false,
    secret: false,
    icon_key: 'theme.drink-it',
    title: partial.title ?? partial.stable_key,
    description: partial.description ?? 'desc',
    earned: !!partial.earned,
    awarded_at_utc: partial.awarded_at_utc ?? null,
    awarded_at_ship_local: partial.awarded_at_ship_local ?? null,
    award_id: partial.award_id ?? null,
    progress: partial.progress ?? null,
    collection: partial.collection ?? null,
    exclusive_claimed: !!partial.exclusive_claimed,
    exclusive_owner_name: partial.exclusive_owner_name ?? null,
    masked: !!partial.masked,
    view: partial.view ?? 'all',
  }
}

function summary(partial: Partial<BarGauntletSummary> & { bar_key: string }): BarGauntletSummary {
  return {
    bar_key: partial.bar_key,
    bar_name: partial.bar_name ?? partial.bar_key,
    live_target: partial.live_target ?? 10,
    personal: partial.personal ?? {
      definition_id: 'p',
      stable_key: `working-drinkit-gauntlet-personal-${partial.bar_key}`,
      earned: false,
      badge_earned: false,
      live_current: 1,
      live_target: 10,
      pin_target: null,
      icon_key: 'score.bar',
    },
    collective: partial.collective ?? {
      definition_id: 'c',
      stable_key: `working-drinkit-gauntlet-collective-${partial.bar_key}`,
      earned: false,
      badge_earned: false,
      live_current: 2,
      live_target: 10,
      pin_target: null,
      icon_key: 'score.team',
    },
  }
}

describe('composeAchievementsView', () => {
  it('orders Davids first and Bar Gauntlets last', () => {
    const cards = [
      card({ stable_key: 'm1', group_key: 'milestones', earned: true }),
      card({ stable_key: 'g1', group_key: 'bar_gauntlets', earned: false, collection: { scope: 'personal', bar_key: 'lido-bar', live_current: 0, live_target: 5, badge_earned: false, pin_target: null, current_menu_complete: false } }),
      card({ stable_key: 'd1', group_key: 'drinking_with_davids', earned: true }),
      card({ stable_key: 'g2', group_key: 'bar_gauntlets', earned: false, collection: { scope: 'collective', bar_key: 'lido-bar', live_current: 0, live_target: 5, badge_earned: false, pin_target: null, current_menu_complete: false } }),
    ]
    const sections = composeAllSections({
      cards,
      gauntlets: [summary({ bar_key: 'lido-bar', bar_name: 'Lido Bar' })],
      filter: 'all',
    })
    expect(sections.map((s) => s.key)).toEqual([
      'drinking-with-davids',
      'milestones',
      'bar-gauntlets',
    ])
  })

  it('keeps tracker when team earned and solo incomplete', () => {
    const s = summary({
      bar_key: 'lido-bar',
      personal: {
        definition_id: 'p',
        stable_key: 'working-drinkit-gauntlet-personal-lido-bar',
        earned: false,
        badge_earned: false,
        live_current: 4,
        live_target: 11,
        pin_target: null,
        icon_key: 'score.bar',
      },
      collective: {
        definition_id: 'c',
        stable_key: 'working-drinkit-gauntlet-collective-lido-bar',
        earned: true,
        badge_earned: true,
        live_current: 11,
        live_target: 11,
        pin_target: 11,
        icon_key: 'score.team',
      },
    })
    expect(gauntletPresentationState(s)).toBe('team_only')
    const cards = [
      card({
        stable_key: s.collective.stable_key,
        group_key: 'bar_gauntlets',
        earned: true,
        collection: {
          scope: 'collective',
          bar_key: 'lido-bar',
          live_current: 11,
          live_target: 11,
          badge_earned: true,
          pin_target: 11,
          current_menu_complete: true,
        },
      }),
      card({
        stable_key: s.personal.stable_key,
        group_key: 'bar_gauntlets',
        earned: false,
        collection: {
          scope: 'personal',
          bar_key: 'lido-bar',
          live_current: 4,
          live_target: 11,
          badge_earned: false,
          pin_target: null,
          current_menu_complete: false,
        },
      }),
    ]
    const sections = composeAllSections({ cards, gauntlets: [s], filter: 'all' })
    const gaunt = sections.find((x) => x.key === 'bar-gauntlets')!
    const kinds = gaunt.children![0].items.map((i) => i.kind)
    expect(kinds).toEqual(['card', 'gauntlet_tracker'])
  })

  it('removes tracker when both team and solo earned', () => {
    const s = summary({
      bar_key: 'lido-bar',
      personal: {
        definition_id: 'p',
        stable_key: 'working-drinkit-gauntlet-personal-lido-bar',
        earned: true,
        badge_earned: true,
        live_current: 11,
        live_target: 11,
        pin_target: 11,
        icon_key: 'score.bar',
      },
      collective: {
        definition_id: 'c',
        stable_key: 'working-drinkit-gauntlet-collective-lido-bar',
        earned: true,
        badge_earned: true,
        live_current: 11,
        live_target: 11,
        pin_target: 11,
        icon_key: 'score.team',
      },
    })
    expect(gauntletPresentationState(s)).toBe('both')
    const cards = [
      card({
        stable_key: s.collective.stable_key,
        group_key: 'bar_gauntlets',
        earned: true,
        collection: {
          scope: 'collective',
          bar_key: 'lido-bar',
          live_current: 11,
          live_target: 11,
          badge_earned: true,
          pin_target: 11,
          current_menu_complete: true,
        },
      }),
      card({
        stable_key: s.personal.stable_key,
        group_key: 'bar_gauntlets',
        earned: true,
        collection: {
          scope: 'personal',
          bar_key: 'lido-bar',
          live_current: 11,
          live_target: 11,
          badge_earned: true,
          pin_target: 11,
          current_menu_complete: true,
        },
      }),
    ]
    const sections = composeAllSections({ cards, gauntlets: [s], filter: 'all' })
    const kinds = sections.find((x) => x.key === 'bar-gauntlets')!.children![0].items.map((i) => i.kind)
    expect(kinds).toEqual(['card', 'card'])
  })

  it('reports solo-without-team as anomaly but still renders safely', () => {
    const anomaly = vi.fn()
    const s = summary({
      bar_key: 'lido-bar',
      personal: {
        definition_id: 'p',
        stable_key: 'working-drinkit-gauntlet-personal-lido-bar',
        earned: true,
        badge_earned: true,
        live_current: 11,
        live_target: 11,
        pin_target: 11,
        icon_key: 'score.bar',
      },
      collective: {
        definition_id: 'c',
        stable_key: 'working-drinkit-gauntlet-collective-lido-bar',
        earned: false,
        badge_earned: false,
        live_current: 10,
        live_target: 11,
        pin_target: null,
        icon_key: 'score.team',
      },
    })
    const cards = [
      card({
        stable_key: s.personal.stable_key,
        group_key: 'bar_gauntlets',
        earned: true,
        collection: {
          scope: 'personal',
          bar_key: 'lido-bar',
          live_current: 11,
          live_target: 11,
          badge_earned: true,
          pin_target: 11,
          current_menu_complete: true,
        },
      }),
      card({
        stable_key: s.collective.stable_key,
        group_key: 'bar_gauntlets',
        earned: false,
        collection: {
          scope: 'collective',
          bar_key: 'lido-bar',
          live_current: 10,
          live_target: 11,
          badge_earned: false,
          pin_target: null,
          current_menu_complete: false,
        },
      }),
    ]
    const sections = composeAllSections({
      cards,
      gauntlets: [s],
      filter: 'all',
      onAnomaly: anomaly,
    })
    expect(anomaly).toHaveBeenCalled()
    const kinds = sections.find((x) => x.key === 'bar-gauntlets')!.children![0].items.map((i) => i.kind)
    expect(kinds).toEqual(['card', 'gauntlet_tracker'])
  })

  it('My Achievements omits trackers and unearned cards', () => {
    const cards = [
      card({ stable_key: 'd1', group_key: 'drinking_with_davids', earned: true }),
      card({ stable_key: 'm1', group_key: 'milestones', earned: false }),
      card({
        stable_key: 'g1',
        group_key: 'bar_gauntlets',
        earned: true,
        collection: {
          scope: 'collective',
          bar_key: 'lido-bar',
          live_current: 11,
          live_target: 11,
          badge_earned: true,
          pin_target: 11,
          current_menu_complete: true,
        },
      }),
    ]
    const sections = composeMineSections({ cards, filter: 'all' })
    expect(sections.every((s) => s.items.every((i) => i.kind === 'card'))).toBe(true)
    expect(sections.flatMap((s) => s.items).map((i) => (i.kind === 'card' ? i.card.stable_key : ''))).toEqual([
      'd1',
      'g1',
    ])
    expect(overallAchievementCounts(cards)).toEqual({ earned: 2, total: 3 })
  })
})
