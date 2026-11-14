import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BountyCarousel from '@/features/drinkit/BountyCarousel.vue'
import { cardDepth } from '@/features/drinkit/cardDepth'
import { wrapLoopIndex } from '@/features/drinkit/carouselScroll'
import {
  visualFixtureActiveCards,
  visualFixtureClosedCards,
  visualFixturePausedCards,
} from '@/features/drinkit/mockHome'
import { copy } from '@/ui/copy'

describe('cardDepth', () => {
  it('fades and recesses a card as it moves off center', () => {
    expect(cardDepth(0)).toMatchObject({ opacity: 1, shift: 0, shadow: true })
    const mid = cardDepth(0.5)
    expect(mid.opacity).toBeGreaterThan(0.35)
    expect(mid.opacity).toBeLessThan(1)
    expect(mid.shift).toBe(5)
    expect(cardDepth(1)).toMatchObject({ opacity: 0.35, shift: 10, shadow: false })
    expect(cardDepth(2).opacity).toBe(0.35)
  })
})

describe('wrapLoopIndex', () => {
  it('teleports only a settled clone, never a real slide', () => {
    expect(wrapLoopIndex(0, 4)).toBe(4)
    expect(wrapLoopIndex(5, 4)).toBe(1)
    expect(wrapLoopIndex(6, 4)).toBe(1)
    expect(wrapLoopIndex(1, 4)).toBeNull()
    expect(wrapLoopIndex(2, 4)).toBeNull()
    expect(wrapLoopIndex(3, 4)).toBeNull()
    expect(wrapLoopIndex(4, 4)).toBeNull()
    expect(wrapLoopIndex(0, 1)).toBeNull()
  })
})

describe('BountyCarousel', () => {
  it('renders active Cocktail/Ingredient fixture fields; Claim It follows claimEnabled', () => {
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
    // Visual fixtures keep Claim It disabled
    expect(claim.attributes('disabled')).toBeDefined()
    expect(claim.text()).toContain(copy.bounty.claimIt)
  })

  it('emits claim when Claim It is enabled', async () => {
    const cards = visualFixtureActiveCards.map((c) =>
      c.id === 'cocktail'
        ? {
            ...c,
            claimEnabled: true,
            claimTitle: 'go',
            claimPrefill: { source: 'cocktail' as const, barCanonicalKey: 'piazza' },
          }
        : c,
    )
    const wrapper = mount(BountyCarousel, { props: { cards } })
    await wrapper.get('[data-testid="bounty-card-cocktail"] [data-testid="bounty-claim"]').trigger('click')
    expect(wrapper.emitted('claim')?.[0]?.[0]).toMatchObject({ id: 'cocktail' })
  })

  it('renders paused messaging without inventing an objective', () => {
    const wrapper = mount(BountyCarousel, {
      props: { cards: visualFixturePausedCards },
    })
    expect(wrapper.text()).toContain(copy.bounty.pausedTitle)
    expect(wrapper.text()).not.toContain('Fixture Spritz')
  })

  it('uses the overnight treatment for closed cards and a different pre-open message', () => {
    const overnight = mount(BountyCarousel, {
      props: { cards: visualFixtureClosedCards },
    })
    expect(
      overnight.get('[data-testid="bounty-card-cocktail"] [data-overlay]').attributes('data-overlay'),
    ).toBe('overnight')
    expect(overnight.text()).toContain('Tomorrow')
    expect(overnight.text()).not.toContain(copy.bounty.preOpening)

    const preopen = mount(BountyCarousel, {
      props: {
        cards: visualFixtureClosedCards.map((card) => ({
          ...card,
          title: copy.bounty.preOpening,
          detail: copy.bounty.preOpeningDetail,
        })),
      },
    })
    expect(
      preopen.get('[data-testid="bounty-card-cocktail"] [data-overlay]').attributes('data-overlay'),
    ).toBe('preopen')
    expect(preopen.text()).toContain(copy.bounty.preOpening)
    expect(preopen.get('[data-testid="bounty-card-cocktail"]').text()).not.toContain('Tomorrow')
  })

  it('shows View Details on the Daily card and Claim It on other bounties', () => {
    const wrapper = mount(BountyCarousel, {
      props: { cards: visualFixtureActiveCards },
    })
    expect(
      wrapper.get('[data-testid="bounty-card-daily"] [data-testid="bounty-claim"]').text(),
    ).toContain(copy.bounty.viewDetails)
    expect(
      wrapper.get('[data-testid="bounty-card-cocktail"] [data-testid="bounty-claim"]').text(),
    ).toContain(copy.bounty.claimIt)
    expect(wrapper.get('[data-testid="bounty-card-daily"]').text()).toContain('Lido Bar')
    expect(wrapper.get('[data-testid="bounty-card-daily"]').text()).not.toContain('Location:')
    expect(wrapper.get('[data-testid="bounty-card-daily"]').text()).toContain('All Hands')
  })

  it('covers a claimed card with earned points and still keeps Claim It disabled', async () => {
    const wrapper = mount(BountyCarousel, {
      props: {
        cards: visualFixtureActiveCards.map((card) =>
          card.id === 'cocktail'
            ? {
                ...card,
                presentation: 'claimed' as const,
                claimEnabled: false,
                pointsLabel: '25 Points',
              }
            : card,
        ),
      },
    })
    const card = wrapper.get('[data-testid="bounty-card-cocktail"]')
    expect(card.get('[data-overlay]').attributes('data-overlay')).toBe('claimed')
    expect(card.text()).toContain('25 Points Earned')
    expect(card.text()).toContain(copy.bounty.claimed)
    expect(card.get('[data-testid="bounty-claim"]').attributes('disabled')).toBeDefined()
    await card.get('[data-overlay="claimed"]').trigger('click')
    expect(card.find('[data-overlay="claimed"]').exists()).toBe(false)
    expect(card.text()).toContain('Fixture Spritz')
  })
})
