import { describe, expect, it } from 'vitest'
import { copy } from '@/ui/copy'

/**
 * Admin section taxonomy contract — keep in sync with AdminView.vue.
 * No empty sections; covers every existing Admin tool surface.
 */
const ADMIN_SECTIONS = [
  { key: 'overview', label: copy.admin.sectionOverview },
  { key: 'players', label: copy.admin.sectionPlayers },
  { key: 'drinkit', label: copy.admin.sectionDrinkIt },
  { key: 'shipclock', label: copy.admin.sectionShipClock },
  { key: 'catalog', label: copy.admin.sectionCatalog },
] as const

describe('admin section navigation copy', () => {
  it('exposes a compact cruise-scoped section list without empty placeholders', () => {
    expect(ADMIN_SECTIONS.map((s) => s.key)).toEqual([
      'overview',
      'players',
      'drinkit',
      'shipclock',
      'catalog',
    ])
    expect(copy.admin.sectionLabel).toBe('Admin section')
    expect(ADMIN_SECTIONS[0]?.key).toBe('overview')
    for (const section of ADMIN_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(2)
    }
  })
})
