import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { sortDrinkitBars } from '@/lib/drinkLog/sortBars'
import BarStep from '@/features/drinkit/log/BarStep.vue'
import DrinkStep from '@/features/drinkit/log/DrinkStep.vue'
import { MOBILE_ORDER_BAR_KEY, type DrinkitBarRow } from '@/types/drinkLog'

const physical: DrinkitBarRow = {
  bar_id: '1',
  canonical_key: 'lido-bar',
  name: 'Lido Bar',
  deck: 17,
}

const mobile: DrinkitBarRow = {
  bar_id: 'mo',
  canonical_key: MOBILE_ORDER_BAR_KEY,
  name: 'Mobile Order',
  deck: 0,
  is_virtual: true,
}

describe('Mobile Order UI', () => {
  it('renders Mobile Order with app meta and last in sorted list', () => {
    const sorted = sortDrinkitBars([mobile, physical], 'alpha')
    expect(sorted.map((b) => b.canonical_key)).toEqual(['lido-bar', MOBILE_ORDER_BAR_KEY])

    const wrapper = mount(BarStep, {
      props: { bars: sorted, sort: 'alpha', status: 'ready' },
    })
    const rows = wrapper.findAll('[data-testid^="bar-row-"]')
    expect(rows.at(-1)?.attributes('data-testid')).toBe(`bar-row-${MOBILE_ORDER_BAR_KEY}`)
    expect(wrapper.text()).toContain('Princess app order')
    expect(wrapper.text()).not.toMatch(/Deck 0/)
  })

  it('uses Mobile Order drink prompt and concept keys', () => {
    const wrapper = mount(DrinkStep, {
      props: {
        drinks: [
          {
            offering_id: 'off-a',
            drink_concept_id: 'concept-1',
            canonical_key: 'mai-tai',
            display_name: 'Mai Tai',
            kind: 'named_cocktail',
          },
        ],
        search: '',
        status: 'ready',
        showUnlisted: false,
        unlistedName: '',
        unlistedType: 'cocktail',
        activeIngredientName: null,
        unlistedContainsIngredient: null,
        showFeaturedConfirm: false,
        featuredDrinkName: null,
        unlistedConfirmFeatured: false,
        isMobileOrder: true,
      },
    })
    expect(wrapper.text()).toContain('What did you order?')
    expect(wrapper.find('[data-testid="drink-row-mai-tai"]').exists()).toBe(true)
  })
})
