import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AchievementCategoryFilter from '@/features/achievements/AchievementCategoryFilter.vue'

const options = [
  { key: 'all', label: 'All' },
  { key: 'drinking-with-davids', label: 'Drinking with Davids' },
  { key: 'bar-gauntlets', label: 'Bar Gauntlets' },
]

describe('AchievementCategoryFilter', () => {
  it('renders a compact trigger and opens a readable menu', async () => {
    const wrapper = mount(AchievementCategoryFilter, {
      props: { modelValue: 'all', options },
      attachTo: document.body,
    })
    const trigger = wrapper.get('[data-testid="achievements-filter-trigger"]')
    expect(trigger.text()).toContain('All')
    expect(wrapper.find('[data-testid="achievements-filter-menu"]').exists()).toBe(false)

    await trigger.trigger('click')
    const menu = wrapper.get('[data-testid="achievements-filter-menu"]')
    expect(menu.findAll('[role="option"]')).toHaveLength(3)
    expect(menu.text()).toContain('Drinking with Davids')

    await wrapper.get('[data-testid="achievements-filter-option-bar-gauntlets"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['bar-gauntlets'])
    expect(wrapper.find('[data-testid="achievements-filter-menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes on Escape', async () => {
    const wrapper = mount(AchievementCategoryFilter, {
      props: { modelValue: 'all', options },
      attachTo: document.body,
    })
    await wrapper.get('[data-testid="achievements-filter-trigger"]').trigger('click')
    expect(wrapper.find('[data-testid="achievements-filter-menu"]').exists()).toBe(true)
    await wrapper.get('[data-testid="achievements-filter-menu"]').trigger('keydown', {
      key: 'Escape',
    })
    expect(wrapper.find('[data-testid="achievements-filter-menu"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
