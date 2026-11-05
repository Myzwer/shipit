import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FriendsStep from '@/features/drinkit/log/FriendsStep.vue'
import { copy } from '@/ui/copy'

describe('FriendsStep', () => {
  const companions = [
    { player_id: 'a', display_name: 'Alex' },
    { player_id: 'b', display_name: 'Bailey' },
  ]

  it('shows exactly one companion selector and optional bar reminder', () => {
    const withReminder = mount(FriendsStep, {
      props: {
        companions,
        selectedIds: [],
        status: 'ready',
        showBarReminder: true,
      },
    })
    expect(withReminder.findAll('[data-testid="friends-list"]').length).toBe(1)
    expect(withReminder.find('[data-testid="bar-bounty-reminder"]').exists()).toBe(true)
    expect(withReminder.text()).toContain(copy.wizard.barReminder)
    expect(withReminder.text()).toContain(copy.wizard.friendsSoloNote)
    // No second eligibility list / toggles
    expect(withReminder.findAll('[data-testid^="friend-row-"]').length).toBe(2)
    expect(withReminder.text()).not.toContain('Bar-eligible')
    expect(withReminder.text()).not.toContain('already used their Bar')

    const noReminder = mount(FriendsStep, {
      props: {
        companions,
        selectedIds: ['a'],
        status: 'ready',
        showBarReminder: false,
      },
    })
    expect(noReminder.find('[data-testid="bar-bounty-reminder"]').exists()).toBe(false)
  })
})
