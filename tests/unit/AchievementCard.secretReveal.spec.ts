import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementCard from '@/features/achievements/AchievementCard.vue'
import type { AchievementCard as AchievementCardModel } from '@/types/achievements'
import { copy } from '@/ui/copy'

function card(
  partial: Partial<AchievementCardModel> &
    Pick<AchievementCardModel, 'title' | 'description' | 'secret' | 'earned' | 'masked'>,
): AchievementCardModel {
  return {
    definition_id: 'def-secret',
    stable_key: 'working-drinkit-secret-example',
    game: 'drinkit',
    group_key: 'other',
    exclusive: false,
    icon_key: partial.masked && partial.secret ? null : 'score.secret',
    awarded_at_utc: partial.earned ? '2026-11-18T00:00:00.000Z' : null,
    award_id: partial.earned ? 'award-1' : null,
    progress: null,
    exclusive_claimed: false,
    exclusive_owner_name: null,
    view: 'all',
    ...partial,
  }
}

describe('AchievementCard secret reveal', () => {
  it('shows generic secret label before finale for unearned secrets', () => {
    const wrapper = mount(AchievementCard, {
      props: {
        card: card({
          title: '?????',
          description: 'Secret Achievement',
          secret: true,
          earned: false,
          masked: true,
        }),
      },
    })
    expect(wrapper.text()).toContain('?????')
    expect(wrapper.text()).toContain(copy.achievements.secretLabel)
    expect(wrapper.text()).not.toContain('Secret: Drink 2 drinks')
    wrapper.unmount()
  })

  it('reveals name and Secret: requirement after finale for unearned secrets', () => {
    const wrapper = mount(AchievementCard, {
      props: {
        card: card({
          title: 'Double Kill',
          description: 'Drink 2 drinks',
          secret: true,
          earned: false,
          masked: false,
        }),
      },
    })
    expect(wrapper.text()).toContain('Double Kill')
    expect(wrapper.text()).toContain('Secret: Drink 2 drinks')
    expect(wrapper.text()).not.toContain(copy.achievements.secretLabel)
    wrapper.unmount()
  })

  it('keeps earned secret presentation without Secret: prefix', () => {
    const wrapper = mount(AchievementCard, {
      props: {
        card: card({
          title: 'Double Kill',
          description: 'Drink 2 drinks',
          secret: true,
          earned: true,
          masked: false,
        }),
      },
    })
    expect(wrapper.text()).toContain('Double Kill')
    expect(wrapper.text()).toContain('Drink 2 drinks')
    expect(wrapper.text()).not.toContain('Secret: Drink 2 drinks')
    wrapper.unmount()
  })

  it('does not alter ordinary unearned achievement descriptions', () => {
    const wrapper = mount(AchievementCard, {
      props: {
        card: card({
          title: '?????',
          description: 'Log any drink.',
          secret: false,
          earned: false,
          masked: true,
        }),
      },
    })
    expect(wrapper.text()).toContain('Log any drink.')
    expect(wrapper.text()).not.toContain('Secret:')
    wrapper.unmount()
  })

  it('applies the same reveal for Ship It! secret cards', () => {
    const wrapper = mount(AchievementCard, {
      props: {
        card: card({
          game: 'shipit',
          group_key: 'firsts_early_wins',
          title: 'Placeholder Secret',
          description: 'Complete a challenge before noon.',
          secret: true,
          earned: false,
          masked: false,
        }),
      },
    })
    expect(wrapper.text()).toContain('Placeholder Secret')
    expect(wrapper.text()).toContain('Secret: Complete a challenge before noon.')
    wrapper.unmount()
  })
})
