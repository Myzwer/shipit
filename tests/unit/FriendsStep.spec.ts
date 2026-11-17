import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FriendsStep from '@/features/drinkit/log/FriendsStep.vue'
import { copy } from '@/ui/copy'

const companions = [
  { player_id: 'other-1', display_name: 'casey other' },
  { player_id: 'crew-a', display_name: 'Alex Crew' },
  { player_id: 'crew-b', display_name: 'blake crew' },
  { player_id: 'other-2', display_name: 'Dana Other' },
]

const baseProps = {
  companions,
  selectedIds: [] as string[],
  status: 'ready' as const,
  showBarReminder: false,
  crewMateIds: [] as string[],
  barPreviewLabel: null as string | null,
  barPreviewKind: 'hidden' as const,
  barPreviewProvisional: false,
}

describe('FriendsStep Bar Bounty preview', () => {
  it('A: at Bar Bounty bar unclaimed — crew-first grouping, badges, other friends selectable', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        ...baseProps,
        selectedIds: ['crew-a'],
        showBarReminder: true,
        crewMateIds: ['crew-a', 'crew-b'],
        barPreviewLabel: 'Bar Bounty — 20 points',
        barPreviewKind: 'eligible',
        barPreviewProvisional: false,
      },
    })
    expect(wrapper.get('[data-testid="friends-helper"]').text()).toBe(
      copy.wizard.friendsHelperBarBounty,
    )
    expect(wrapper.get('[data-testid="bar-bounty-points-preview"]').text()).toContain(
      'Bar Bounty — 20 points',
    )
    expect(wrapper.get('[data-testid="bar-bounty-reminder"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="friends-crew-group"]').text()).toContain('Alex Crew')
    expect(wrapper.get('[data-testid="friends-crew-group"]').text()).toContain('blake crew')
    expect(wrapper.get('[data-testid="friends-others-group"]').text()).toContain('casey other')
    expect(wrapper.get('[data-testid="friend-row-crew-a"]').attributes('data-crew-mate')).toBe(
      'true',
    )
    expect(wrapper.get('[data-testid="friend-row-other-1"]').attributes('data-crew-mate')).toBe(
      'false',
    )
    expect(wrapper.find('[data-testid="friends-standard-list"]').exists()).toBe(false)
  })

  it('shows need-crewmate copy without blocking continue', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        ...baseProps,
        selectedIds: ['other-1'],
        showBarReminder: true,
        crewMateIds: ['crew-a', 'crew-b'],
        barPreviewLabel: 'Bar Bounty needs at least one assigned crewmate.',
        barPreviewKind: 'need_crewmate',
        barPreviewProvisional: false,
      },
    })
    expect(wrapper.get('[data-testid="bar-bounty-points-preview"]').attributes('data-preview-kind')).toBe(
      'need_crewmate',
    )
    expect(wrapper.get('[data-testid="friends-continue"]').exists()).toBe(true)
  })
})

describe('FriendsStep standard list (non–Bar Bounty context)', () => {
  it('B: different bar, unclaimed — single alphabetical list, no crew chrome', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        ...baseProps,
        // Parent gates: empty crew ids + hidden preview even if player has a crew today
      },
    })
    expect(wrapper.get('[data-testid="friends-helper"]').text()).toBe(copy.wizard.friendsHelper)
    expect(wrapper.get('[data-testid="friends-helper"]').text()).toBe(
      'Select anyone from Drink It! who is with you.',
    )
    expect(wrapper.find('[data-testid="bar-bounty-points-preview"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bar-bounty-reminder"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="friends-crew-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="friends-others-group"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="friends-standard-list"]').exists()).toBe(true)

    const names = wrapper
      .findAll('[data-testid^="friend-row-"]')
      .map((row) => row.text())
    expect(names[0]).toContain('Alex Crew')
    expect(names[1]).toContain('blake crew')
    expect(names[2]).toContain('casey other')
    expect(names[3]).toContain('Dana Other')
    expect(wrapper.find('[data-crew-mate="true"]').exists()).toBe(false)
  })

  it('C: different bar, claimed — no already-claimed banner', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        ...baseProps,
        // Claimed must not surface on Friends when parent hides preview
        barPreviewKind: 'hidden',
        barPreviewLabel: null,
        crewMateIds: [],
      },
    })
    expect(wrapper.find('[data-testid="bar-bounty-points-preview"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain("You've already claimed today's Bar Bounty.")
    expect(wrapper.get('[data-testid="friends-standard-list"]').exists()).toBe(true)
  })

  it('D: at Bar Bounty bar after claim — standard list (parent hides crew chrome)', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        ...baseProps,
        showBarReminder: false,
        crewMateIds: [],
        barPreviewKind: 'hidden',
        barPreviewLabel: null,
      },
    })
    expect(wrapper.find('[data-testid="friends-crew-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bar-bounty-points-preview"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="friends-standard-list"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="friends-continue"]').exists()).toBe(true)
  })

  it('E: Ingredient-style ordinary log — no Bar Bounty completion messaging', () => {
    const wrapper = mount(FriendsStep, {
      props: baseProps,
    })
    expect(wrapper.text()).not.toContain('Bar Bounty')
    expect(wrapper.get('[data-testid="friends-helper"]').text()).not.toMatch(/crewmate/i)
  })

  it('preserves selection toggles in standard mode', async () => {
    const wrapper = mount(FriendsStep, {
      props: {
        ...baseProps,
        selectedIds: ['crew-a'],
      },
    })
    await wrapper.get('[data-testid="friend-row-other-1"]').trigger('click')
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['other-1'])
  })
})
