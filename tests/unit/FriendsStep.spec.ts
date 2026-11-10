import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FriendsStep from '@/features/drinkit/log/FriendsStep.vue'

const companions = [
  { player_id: 'crew-a', display_name: 'Alex Crew' },
  { player_id: 'crew-b', display_name: 'Blake Crew' },
  { player_id: 'other-1', display_name: 'Casey Other' },
]

describe('FriendsStep Bar Bounty preview', () => {
  it('marks assigned crewmates and shows exact points banner', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        companions,
        selectedIds: ['crew-a'],
        status: 'ready',
        showBarReminder: true,
        crewMateIds: ['crew-a', 'crew-b'],
        barPreviewLabel: 'Bar Bounty — 20 points',
        barPreviewKind: 'eligible',
        barPreviewProvisional: false,
      },
    })
    expect(wrapper.get('[data-testid="bar-bounty-points-preview"]').text()).toContain(
      'Bar Bounty — 20 points',
    )
    expect(wrapper.get('[data-testid="friend-row-crew-a"]').attributes('data-crew-mate')).toBe(
      'true',
    )
    expect(wrapper.get('[data-testid="friend-row-other-1"]').attributes('data-crew-mate')).toBe(
      'false',
    )
    expect(wrapper.get('[data-testid="friends-crew-group"]').text()).toContain('Alex Crew')
  })

  it('shows need-crewmate copy without blocking continue', () => {
    const wrapper = mount(FriendsStep, {
      props: {
        companions,
        selectedIds: ['other-1'],
        status: 'ready',
        showBarReminder: false,
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
