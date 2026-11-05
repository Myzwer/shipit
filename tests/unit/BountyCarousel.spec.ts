import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BountyCarousel from '@/features/drinkit/BountyCarousel.vue'
import {
  visualFixtureActiveCards,
  visualFixturePausedCards,
} from '@/features/drinkit/mockHome'
import { copy } from '@/ui/copy'

describe('BountyCarousel', () => {
  it('renders active Cocktail/Ingredient fixture fields and disabled Claim It', () => {
    const wrapper = mount(BountyCarousel, {
      props: { cards: visualFixtureActiveCards },
    })
    expect(wrapper.get('[data-testid="bounty-card-cocktail"]').text()).toContain('Fixture Spritz')
    expect(wrapper.get('[data-testid="bounty-card-cocktail"]').text()).toContain('Familiar')
    expect(wrapper.get('[data-testid="bounty-card-cocktail"]').text()).toContain('25 Points')
    expect(wrapper.get('[data-testid="bounty-card-cocktail"]').text()).toContain(
      'Location: Fixture Piazza',
    )
    expect(wrapper.get('[data-testid="bounty-card-ingredient"]').text()).toContain('Fixture Orgeat')
    expect(wrapper.get('[data-testid="bounty-card-ingredient"]').text()).toContain(
      'Available at 5 bars',
    )
    const claim = wrapper.get('[data-testid="bounty-card-cocktail"] [data-testid="bounty-claim"]')
    expect(claim.attributes('disabled')).toBeDefined()
    expect(claim.text()).toContain(copy.bounty.claimIt)
  })

  it('renders paused messaging without inventing an objective', () => {
    const wrapper = mount(BountyCarousel, {
      props: { cards: visualFixturePausedCards },
    })
    expect(wrapper.text()).toContain(copy.bounty.pausedTitle)
    expect(wrapper.text()).not.toContain('Fixture Spritz')
  })
})
