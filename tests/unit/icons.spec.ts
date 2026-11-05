import { describe, expect, it } from 'vitest'
import { fontAwesomeProvider, resolveIcon } from '@/ui/icons'

describe('icon registry', () => {
  it('resolves navigation icons from Pro packages', () => {
    const homeOutline = resolveIcon('nav.home', 'outline')
    const homeSolid = resolveIcon('nav.home', 'solid')
    expect(homeOutline.iconName).toBe('house')
    expect(homeOutline.prefix).toBe('fal')
    expect(homeSolid.prefix).toBe('fas')
    expect(resolveIcon('nav.action', 'solid').iconName).toBe('square-plus')
    expect(resolveIcon('theme.drink-it').iconName).toBe('martini-glass')
    expect(resolveIcon('theme.ship-it').iconName).toBe('ship')
    expect(resolveIcon('status.selected', 'solid').iconName).toBe('badge-check')
  })

  it('uses Font Awesome Pro as the provider', () => {
    expect(fontAwesomeProvider).toBe('pro')
  })
})
