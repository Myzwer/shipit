/**
 * Phase 2C.13A — BarStep Ingredient Claim guidance UI.
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BarStep from '@/features/drinkit/log/BarStep.vue'
import { copy } from '@/ui/copy'
import type { DrinkitBarRow } from '@/types/drinkLog'

const bars: DrinkitBarRow[] = [
  { bar_id: '1', canonical_key: 'crooners', name: 'Crooners', deck: 7 },
  { bar_id: '2', canonical_key: 'lido-bar', name: 'Lido Bar', deck: 15 },
  {
    bar_id: '3',
    canonical_key: 'mobile-order',
    name: 'Mobile Order',
    deck: 0,
    is_virtual: true,
  },
]

describe('BarStep Ingredient Claim guide (2C.13A)', () => {
  it('ordinary logging: all bars selectable, no guide copy', () => {
    const wrapper = mount(BarStep, {
      props: {
        bars,
        sort: 'alpha',
        status: 'ready',
        ingredientGuide: false,
      },
    })
    expect(wrapper.find('[data-testid="ingredient-bar-guide"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bar-row-lido-bar"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('[data-testid="ingredient-bar-not-listed"]').length).toBe(0)
  })

  it('Ingredient Claim: subdues ineligible bars with Not listed here cue', async () => {
    const eligible = new Set(['crooners'])
    const onSelect = vi.fn()
    const wrapper = mount(BarStep, {
      props: {
        bars,
        sort: 'alpha',
        status: 'ready',
        ingredientGuide: true,
        ingredientAvailabilityReady: true,
        isBarEligible: (key: string) => eligible.has(key),
      },
    })

    expect(wrapper.find('[data-testid="ingredient-bar-guide"]').text()).toBe(
      copy.wizard.ingredientBarGuide,
    )
    expect(wrapper.find('[data-testid="bar-row-crooners"]').classes()).not.toContain('is-unavailable')
    expect(wrapper.find('[data-testid="bar-row-crooners"]').attributes('data-ingredient-eligible')).toBe(
      'true',
    )

    const ineligible = wrapper.find('[data-testid="bar-row-lido-bar"]')
    expect(ineligible.classes()).toContain('is-unavailable')
    expect(ineligible.attributes('disabled')).toBeDefined()
    expect(ineligible.attributes('data-ingredient-eligible')).toBe('false')
    expect(ineligible.text()).toContain(copy.wizard.ingredientBarNotListed)

    await ineligible.trigger('click')
    expect(onSelect).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('Ingredient Claim: eligible bar remains selectable', async () => {
    const eligible = new Set(['crooners'])
    const wrapper = mount(BarStep, {
      props: {
        bars,
        sort: 'alpha',
        status: 'ready',
        ingredientGuide: true,
        ingredientAvailabilityReady: true,
        isBarEligible: (key: string) => eligible.has(key),
      },
    })
    await wrapper.find('[data-testid="bar-row-crooners"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(bars[0])
    wrapper.unmount()
  })

  it('does not reveal qualifying drink names in bar guide UI', () => {
    const wrapper = mount(BarStep, {
      props: {
        bars,
        sort: 'alpha',
        status: 'ready',
        ingredientGuide: true,
        ingredientAvailabilityReady: true,
        isBarEligible: () => true,
      },
    })
    const text = wrapper.text()
    expect(text).not.toMatch(/Mai Tai|Ferrero|qualifying cocktail/i)
    expect(text).toContain(copy.wizard.ingredientBarGuide)
    wrapper.unmount()
  })

  it('shows honest notice when availability cannot be confirmed', () => {
    const wrapper = mount(BarStep, {
      props: {
        bars,
        sort: 'alpha',
        status: 'ready',
        ingredientGuide: true,
        ingredientAvailabilityReady: false,
        ingredientAvailabilityNotice: true,
        isBarEligible: () => false,
      },
    })
    expect(wrapper.find('[data-testid="ingredient-bar-availability-notice"]').text()).toBe(
      copy.wizard.ingredientBarAvailabilityUnavailable,
    )
    // Incomplete data: do not soft-lock bars.
    expect(wrapper.find('[data-testid="bar-row-lido-bar"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
